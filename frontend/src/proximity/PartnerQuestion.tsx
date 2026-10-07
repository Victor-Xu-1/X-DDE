import { PartnerStep } from "./PartnerStep";
import { BindingRegion } from "./BindingRegion";
import { AtomMapping } from "./AtomMapping";
import { partnerRoles } from "./types";
import type { ProximityDraft } from "./useProximityDraft";
import type { Language } from "../types";
export function PartnerQuestion({
  side,
  draft: d,
  language,
}: {
  side: "a" | "b";
  draft: ProximityDraft;
  language: Language;
}) {
  const a = side === "a",
    zh = language === "zh",
    roles = partnerRoles(d.payload.mechanism, zh);
  return (
    <>
      <label className="proximity-partner-name">
        {zh ? "伙伴名称" : "Partner name"}
        <input
          maxLength={80}
          value={a ? d.payload.partner_a_name : d.payload.partner_b_name}
          onChange={(e) =>
            d.setPayload({
              ...d.payload,
              [a ? "partner_a_name" : "partner_b_name"]: e.target.value,
            })
          }
        />
      </label>
      <PartnerStep
        title={roles[a ? 0 : 1]}
        source={a ? d.first : d.second}
        arm={a ? d.armA : d.armB}
        chain={a ? d.payload.partner_a_chain : d.payload.partner_b_chain}
        binary={d.binary}
        language={language}
        onSource={a ? d.onFirst : d.onSecond}
        onArm={(value) => {
          (a ? d.setArmA : d.setArmB)(value);
          (a ? d.setMappingValidA : d.setMappingValidB)(true);
          d.setPayload({ ...d.payload, [a ? "arm_a_map" : "arm_b_map"]: [] });
        }}
        onChain={a ? d.onChainA : d.onChainB}
        onValid={a ? d.setValidA : d.setValidB}
        sameSource={!a && d.region ? d.first : null}
        onSameSource={() => d.onSecond(d.first)}
      />
      {d.binary && (
        <AtomMapping
          key={
            (a ? d.armA?.asset_id : d.armB?.asset_id) + ":" + d.ligand?.asset_id
          }
          value={a ? d.payload.arm_a_map : d.payload.arm_b_map}
          language={language}
          onValid={a ? d.setMappingValidA : d.setMappingValidB}
          onChange={(value) =>
            d.setPayload({
              ...d.payload,
              [a ? "arm_a_map" : "arm_b_map"]: value,
            })
          }
        />
      )}
      {d.region && d.ligand && (
        <BindingRegion
          source={d.ligand}
          language={language}
          title={zh ? "点选这一端的分子原子" : "Select this binding region"}
          selected={a ? d.payload.binding_region_a : d.payload.binding_region_b}
          other={a ? d.payload.binding_region_b : d.payload.binding_region_a}
          onChange={(value) =>
            d.setPayload({
              ...d.payload,
              [a ? "binding_region_a" : "binding_region_b"]: value,
            })
          }
        />
      )}
      {!a && d.sameChain && (
        <p role="alert" className="field-note">
          {zh
            ? "两个伙伴需要选择不同的蛋白链。"
            : "Choose different protein chains for the two partners."}
        </p>
      )}
    </>
  );
}
