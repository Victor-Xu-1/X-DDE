"""Strict bounded FASTQ input and descriptive sequencing QC without trimming barcode regions."""

from collections import Counter

from platformnative_io import text_lines


def reads(path, expanded_bytes):
    from dnaio import SequenceRecord

    lines = iter(text_lines(path, expanded_bytes, maximum_line=65536))
    while True:
        header = next(lines, None)
        if header is None:
            return
        sequence, separator, quality = (next(lines, None) for _ in range(3))
        if (
            not header.startswith("@")
            or sequence is None
            or separator is None
            or quality is None
            or not separator.startswith("+")
        ):
            raise ValueError("A FASTQ record is malformed or truncated.")
        sequence, quality = sequence.strip().upper(), quality.rstrip("\r\n")
        if (
            not sequence
            or len(sequence) != len(quality)
            or set(sequence) - set("ACGTN")
            or any(not 33 <= ord(value) <= 126 for value in quality)
        ):
            raise ValueError("FASTQ bases, sequence length or Phred+33 qualities are invalid.")
        yield SequenceRecord(header[1:].strip(), sequence, quality)


class Quality:
    def __init__(self):
        self.lengths, self.quality_sum, self.position_reads = Counter(), [], []
        self.bases = self.q30 = self.total = 0

    def add(self, read):
        self.total += 1
        self.lengths[len(read)] += 1
        values = [ord(value) - 33 for value in read.qualities]
        self.bases += len(values)
        self.q30 += sum(value >= 30 for value in values)
        if len(values) <= 5000:
            missing = len(values) - len(self.quality_sum)
            if missing > 0:
                self.quality_sum.extend([0] * missing)
                self.position_reads.extend([0] * missing)
            for position, value in enumerate(values):
                self.quality_sum[position] += value
                self.position_reads[position] += 1
        return sum(values) / len(values)

    def result(self):
        return {
            "reads": self.total,
            "bases": self.bases,
            "q30_fraction": self.q30 / self.bases if self.bases else 0,
            "lengths": [
                {"length": length, "reads": count} for length, count in sorted(self.lengths.items())
            ],
            "mean_quality": [
                total / count
                for total, count in zip(self.quality_sum, self.position_reads, strict=True)
            ],
        }
