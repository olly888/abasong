"""Compatibility entry: emit from the sole current JSON; never rebuild from V2."""
from pathlib import Path
import subprocess
root = Path(__file__).resolve().parents[1]
subprocess.run([str(root / 'scripts/dev'), 'tokens:generate'], cwd=root, check=True)
