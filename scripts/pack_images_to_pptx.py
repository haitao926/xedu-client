#!/usr/bin/env python3
import os
import zipfile
import shutil

TEMPLATE_PPTX = 'ppt-output/XEdu-Client-教师课程创建工作坊.pptx'
OUT_PPTX = 'ppt-output/XEdu_Client_20min_Keynote_Launch.pptx'
SLIDES_DIR = 'ppt-output/slides_hd'

def create_pptx_with_images():
    # Create temp directory in local output folder
    work_dir = 'ppt-output/tmp_pptx'
    if os.path.exists(work_dir):
        shutil.rmtree(work_dir)
    os.makedirs(work_dir, exist_ok=True)

    # Extract template
    with zipfile.ZipFile(TEMPLATE_PPTX, 'r') as z:
        z.extractall(work_dir)

    print("Extracted template pptx.")

    # Copy generated slide images into ppt/media/
    media_dir = os.path.join(work_dir, 'ppt', 'media')
    os.makedirs(media_dir, exist_ok=True)

    for i in range(1, 17):
        img_src = os.path.join(SLIDES_DIR, f"slide_{i:02d}.png")
        img_dst = os.path.join(media_dir, f"xedu_slide_{i:02d}.png")
        if os.path.exists(img_src):
            shutil.copy(img_src, img_dst)

    print("Copied 16 HD slide images into pptx media folder.")

    # Build the output zip pptx
    if os.path.exists(OUT_PPTX):
        os.remove(OUT_PPTX)

    with zipfile.ZipFile(OUT_PPTX, 'w', zipfile.ZIP_DEFLATED) as zout:
        for root, dirs, files in os.walk(work_dir):
            for file in files:
                full_path = os.path.join(root, file)
                rel_path = os.path.relpath(full_path, work_dir)
                zout.write(full_path, rel_path)

    print(f"SUCCESS: Packaged {OUT_PPTX}")

    # Cleanup temp
    shutil.rmtree(work_dir)

if __name__ == "__main__":
    create_pptx_with_images()
