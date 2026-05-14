import os
import zipfile
import docx
from docx.oxml.ns import qn
from docx.oxml.shape import CT_Picture

def docx_to_md_with_images(docx_path, md_path, img_dir_rel):
    doc = docx.Document(docx_path)
    output_dir = os.path.dirname(md_path)
    img_dir_full = os.path.join(output_dir, img_dir_rel)
    
    if not os.path.exists(img_dir_full):
        os.makedirs(img_dir_full)
    
    # Map relationship ID to filename
    rels = doc.part.rels
    img_map = {}
    for rel in rels.values():
        if "image" in rel.target_ref:
            img_map[rel.rId] = os.path.basename(rel.target_ref)

    with open(md_path, "w", encoding="utf-8") as f:
        for block in iter_block_items(doc):
            if isinstance(block, docx.text.paragraph.Paragraph):
                # Check for images in paragraph
                for run in block.runs:
                    # Look for drawing elements
                    for drawing in run._element.xpath('.//w:drawing'):
                        for blip in drawing.xpath('.//a:blip/@r:embed', namespaces={'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main', 'a': 'http://schemas.openxmlformats.org/drawingml/2006/main', 'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'}):
                            if blip in img_map:
                                f.write(f"![image](./{img_dir_rel}/{img_map[blip]})\n\n")
                
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
    docx_path = r"c:\Users\Laptop\Documents\testproject\docs\SRA_doc\phase_3\sra-memberB.docx"
    md_path = r"c:\Users\Laptop\Documents\testproject\docs\SRA_doc\phase_3\sra-memberB.md"
    docx_to_md_with_images(docx_path, md_path, "images/memberB")
