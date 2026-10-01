"""Real bounded protonation/tautomer/stereo enumeration, never a population prediction."""

from random import Random

from mapping import correspondence, labelled_smiles, normalize, restore_labels, stereo_preserved


def enumerate_states(source, options):
    from rdkit import Chem
    from rdkit.Chem import rdMolDescriptors
    from rdkit.Chem.EnumerateStereoisomers import EnumerateStereoisomers, StereoEnumerationOptions
    from rdkit.Chem.MolStandardize import rdMolStandardize

    # The frozen upstream release documents this ionization-rule limitation.
    tertiary_amide = Chem.MolFromSmarts("[CX3](=O)[NX3;H0]")
    if options.protonation and source.HasSubstructMatch(tertiary_amide):
        raise ValueError(
            "Dimorphite-DL 2.0.2 has a known tertiary-amide protonation limitation. "
            "Disable pH enumeration and retain the supplied charge state for this input."
        )
    bounded, protonation_rejected = [], 0
    if options.protonation:
        from dimorphite_dl.protonate.run import Protonate

        protonator = Protonate(
            smiles_input=labelled_smiles(source),
            ph_min=options.ph_min,
            ph_max=options.ph_max,
            precision=options.precision,
            max_variants=options.max_states + 1,
            validate_output=True,
        )
        values = protonator.to_list()
        if protonator.stats.fallback_used:
            raise ValueError(
                "The protonation method used a fallback instead of valid state enumeration. "
                "Inspect native logs or retain the supplied chemical state."
            )
        protonation_rejected = protonator.stats.variants_rejected
        bounded = [restore_labels(s, source) for s in values]
    else:
        bounded = [Chem.Mol(source)]
    if not bounded:
        raise ValueError("The protonation method returned no valid state.")
    truncated = len(bounded) > options.max_states
    bounded = sorted(bounded, key=lambda m: Chem.MolToSmiles(m))[: options.max_states]
    enumerator = rdMolStandardize.TautomerEnumerator()
    enumerator.SetMaxTautomers(options.max_tautomers + 1)
    enumerator.SetMaxTransforms(512)
    enumerator.SetRemoveSp3Stereo(False)
    enumerator.SetRemoveBondStereo(False)
    enumerator.SetReassignStereo(True)
    stereo = StereoEnumerationOptions(
        onlyUnassigned=True,
        unique=True,
        maxIsomers=options.max_stereoisomers + 1,
        rand=Random(options.seed),
    )
    states, work, rejected = {}, 0, 0
    for protomer in bounded:
        variants = enumerator.Enumerate(protomer) if options.tautomers else [protomer]
        truncated |= len(variants) > options.max_tautomers
        if options.tautomers:
            truncated |= str(variants.status) != "Completed"
        for tautomer in list(variants)[: options.max_tautomers]:
            # RDKit 2023 stereo enumeration consumes _ChiralityPossible; tautomer
            # reassignment clears this computed flag, so discover centers again.
            Chem.AssignStereochemistry(
                tautomer, cleanIt=True, force=True, flagPossibleStereoCenters=True
            )
            candidates = (
                list(EnumerateStereoisomers(tautomer, options=stereo))
                if options.stereoisomers
                else [tautomer]
            )
            truncated |= len(candidates) > options.max_stereoisomers
            for mol in candidates[: options.max_stereoisomers]:
                work += 1
                if work > 512:
                    truncated = True
                    break
                mol = normalize(mol)
                mapping = correspondence(source, mol)
                if not stereo_preserved(source, mol, mapping):
                    rejected += 1
                    continue
                smiles = Chem.MolToSmiles(mol, isomericSmiles=True)
                if smiles not in states:
                    states[smiles] = {
                        "molecule": mol,
                        "smiles": smiles,
                        "charge": Chem.GetFormalCharge(mol),
                        "formula": rdMolDescriptors.CalcMolFormula(mol),
                        "source_to_state_atoms": mapping,
                    }
                if len(states) > options.max_states:
                    truncated = True
                    break
            if work > 512 or len(states) > options.max_states:
                break
        if work > 512 or len(states) > options.max_states:
            break
    output = [states[key] for key in sorted(states)[: options.max_states]]
    if not output:
        raise ValueError("No state retained the defined source stereochemistry.")
    return output, {
        "budget_limited": bool(truncated),
        "enumeration_work": work,
        "rejected": rejected,
        "protonation_rejected": protonation_rejected,
        "population_probabilities": "not_computed",
    }
