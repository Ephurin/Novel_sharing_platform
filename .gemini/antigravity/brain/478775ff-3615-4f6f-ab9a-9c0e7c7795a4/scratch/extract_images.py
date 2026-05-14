import os
import zipfile
import shutil

def extract_images(docx_path, output_dir):
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)
    
    with zipfile.ZipFile(docx_path, 'r') as zip_ref:
        image_files = [f for f in zip_ref.namelist() if f.startswith('word/media/')]
        for img_file in image_files:
            filename = os.path.basename(img_file)
            target_path = os.path.join(output_dir, filename)
            with zip_ref.open(img_file) as source, open(target_path, 'wb') as target:
                shutil.copyfileobj(source, target)
    return image_files

if __name__ == "__main__":
    docx_path = r"c:\Users\Laptop\Documents\testproject\docs\SRA_doc\phase_3\sra-memberB.docx"
    output_dir = r"c:\Users\Laptop\Documents\testproject\docs\SRA_doc\phase_3\images\memberB"
    extracted = extract_images(docx_path, output_dir)
    print(f"Extracted {len(extracted)} images to {output_dir}")
