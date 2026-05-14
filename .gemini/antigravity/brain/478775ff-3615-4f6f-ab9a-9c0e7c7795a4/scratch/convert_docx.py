import sys

try:
    import docx
except ImportError:
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "python-docx"])
    import docx

def docx_to_md(docx_path, md_path):
    doc = docx.Document(docx_path)
    with open(md_path, "w", encoding="utf-8") as f:
        for para in doc.paragraphs:
            if para.style.name.startswith('Heading'):
                level = para.style.name.split(' ')[-1]
                if level.isdigit():
                    f.write("#" * int(level) + " " + para.text + "\n\n")
                else:
                    f.write("# " + para.text + "\n\n")
            else:
                f.write(para.text + "\n\n")

if __name__ == "__main__":
    docx_to_md(r"c:\Users\Laptop\Documents\testproject\docs\SRA_doc\phase_3\sra-memberB.docx", r"c:\Users\Laptop\Documents\testproject\docs\SRA_doc\phase_3\sra-memberB.md")
