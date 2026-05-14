import sys
import docx

def docx_to_md(docx_path, md_path):
    doc = docx.Document(docx_path)
    with open(md_path, "w", encoding="utf-8") as f:
        for block in iter_block_items(doc):
            if isinstance(block, docx.text.paragraph.Paragraph):
                if block.style.name.startswith('Heading'):
                    level = block.style.name.split(' ')[-1]
                    if level.isdigit():
                        f.write("#" * int(level) + " " + block.text + "\n\n")
                    else:
                        f.write("# " + block.text + "\n\n")
                else:
                    if block.text.strip():
                        f.write(block.text + "\n\n")
            elif isinstance(block, docx.table.Table):
                for row in block.rows:
                    row_data = [cell.text.strip().replace("\n", " ") for cell in row.cells]
                    f.write("| " + " | ".join(row_data) + " |\n")
                f.write("\n")

def iter_block_items(parent):
    if isinstance(parent, docx.document.Document):
        parent_elm = parent.element.body
    elif isinstance(parent, docx.table._Cell):
        parent_elm = parent._tc
    else:
        raise ValueError("something's wrong")

    for child in parent_elm.iterchildren():
        if isinstance(child, docx.oxml.text.paragraph.CT_P):
            yield docx.text.paragraph.Paragraph(child, parent)
        elif isinstance(child, docx.oxml.table.CT_Tbl):
            yield docx.table.Table(child, parent)

if __name__ == "__main__":
    docx_to_md(r"c:\Users\Laptop\Documents\testproject\docs\SRA_doc\phase_3\sra-memberB.docx", r"c:\Users\Laptop\Documents\testproject\docs\SRA_doc\phase_3\sra-memberB.md")
