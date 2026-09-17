import sys
from pathlib import Path
import test_chapters

test_chapters.STORY_DIR = Path(__file__).resolve().parent / "test_data" / "stories" / "set2"
test_chapters.main()
