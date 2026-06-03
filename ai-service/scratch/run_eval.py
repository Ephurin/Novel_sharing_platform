import sys
import io
import runpy

def run_test(script_path, output_path):
    print(f"Running {script_path}...")
    original_stdout = sys.stdout
    try:
        with open(output_path, 'w', encoding='utf-8') as f:
            sys.stdout = f
            runpy.run_path(script_path, run_name="__main__")
    finally:
        sys.stdout = original_stdout
    print(f"Finished {script_path}. Output saved to {output_path}")

if __name__ == '__main__':
    run_test('scratch/test_chapters.py', 'scratch/eval_colab_1.txt')
    run_test('scratch/run_test_2.py', 'scratch/eval_colab_2.txt')
