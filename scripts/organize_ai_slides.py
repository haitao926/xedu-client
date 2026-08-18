#!/usr/bin/env python3
import os
import shutil

ART_DIR = '/Users/apple/.gemini/antigravity/brain/02f6ef4c-9aed-4c01-ae7b-6dbb0839ff5f'
OUT_IMG_DIR = 'ppt-output/slides_ai'
os.makedirs(OUT_IMG_DIR, exist_ok=True)

AI_IMAGES = [
    (1, "slide_01_cover_1786884187611.jpg"),
    (2, "slide_02_pain_points_1786884338001.jpg"),
    (3, "slide_03_identity_1786884499432.jpg"),
    (4, "slide_04_three_tiers_1786885949607.jpg"),
    (5, "slide_05_course_sharing_1786901865544.jpg"),
    (6, "slide_06_video1_1786887054569.jpg"),
    (7, "slide_07_html_theory_1786901304739.jpg"),
    (8, "slide_08_video2_html_1786901337359.jpg"),
    (9, "slide_09_scratch_theory_1786901358904.jpg"),
    (10, "slide_10_video3_scratch_1786901400114.jpg"),
    (11, "slide_11_jupyter_theory_1786901417233.jpg"),
    (12, "slide_12_video4_jupyter_1786901465649.jpg"),
    (13, "slide_13_case_study_1786901487170.jpg"),
    (14, "slide_14_boundaries_1786901535588.jpg"),
    (15, "slide_15_ecosystem_sharing_1786901898918.jpg"),
    (16, "slide_16_ending_cta_1786901692482.jpg"),
]

for num, fname in AI_IMAGES:
    src = os.path.join(ART_DIR, fname)
    dst = os.path.join(OUT_IMG_DIR, f"slide_{num:02d}.jpg")
    if os.path.exists(src):
        shutil.copy(src, dst)
        print(f"Copied P{num:02d} -> {dst}")
    else:
        print(f"MISSING: {src}")

print("Refreshed all 16 AI Images in ppt-output/slides_ai/!")
