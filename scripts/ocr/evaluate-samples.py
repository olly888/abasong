"""Evaluate synthetic OCR separately from conservative label/section pairing."""
from pathlib import Path
import json
import re
import sys

ADDRESS = re.compile(r"^\d{1,5}\s+.+\b(?:Ave|Street|St|Blvd|Road|Rd|Way)\b", re.I)
LABEL = re.compile(r"^(?:Gate|Access|Entry)\s+code\s*:\s*(.+)$", re.I)


def extract(lines):
    """Keep missing/ambiguous addresses unresolved; do not infer a building."""
    pending, output = [], []
    for row in lines:
        text = row["text"].strip()
        if ADDRESS.search(text):
            pending.append(text)
        hit = LABEL.match(text)
        if hit:
            output.append({
                "address": pending[0] if len(pending) == 1 else None,
                "code": hit[1].strip(),
                "status": "candidate" if len(pending) == 1 else
                          "missing_address" if not pending else "ambiguous",
            })
            pending = []
    return output


def evaluate(root):
    truth = {sample["id"]: sample for sample in json.loads((root / "truth.json").read_text())}
    raw = json.loads((root / "ocr.json").read_text())
    results = []
    for row in raw:
        expected = [{"address": e.get("address"), "code": e["code"], "status": e["status"]}
                    for e in truth[row["id"]]["expected"]]
        actual = extract(row["lines"])
        results.append({
            "id": row["id"],
            "code_exact": sorted(e["code"] for e in expected) == sorted(e["code"] for e in actual),
            "pair_and_status_exact": actual == expected,
            "expected_count": len(expected),
            "actual_count": len(actual),
            "milliseconds": row["milliseconds"],
        })
    report = {
        "scope": "8 synthetic AppKit images; Apple Vision on macOS; no cloud/real screenshot/production acceptance",
        "recognizer": "Apple Vision accurate en-US, language correction off",
        "association": "conservative explicit label + address-section baseline, not ML/provider decision",
        "samples": len(results),
        "code_exact": sum(x["code_exact"] for x in results),
        "pair_and_status_exact": sum(x["pair_and_status_exact"] for x in results),
        "false_positive_on_negative": sum(x["actual_count"] for x in results if x["expected_count"] == 0),
        "details": results,
    }
    (root / "summary.json").write_text(json.dumps(report, ensure_ascii=False, indent=2))
    # Counts, sample IDs and timings only; never print recognized strings.
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    evaluate(Path(sys.argv[1]))
