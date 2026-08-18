#!/usr/bin/env python3
import os
import zipfile
import shutil

OUT_PPTX = 'ppt-output/XEdu_Client_20min_Keynote_Launch.pptx'
SLIDES_DIR = 'ppt-output/slides_ai'
TOTAL_SLIDES = 16

def build_pristine_pptx():
    temp_dir = 'ppt-output/tmp_clean_pptx'
    if os.path.exists(temp_dir):
        shutil.rmtree(temp_dir)

    os.makedirs(os.path.join(temp_dir, '_rels'), exist_ok=True)
    os.makedirs(os.path.join(temp_dir, 'docProps'), exist_ok=True)
    os.makedirs(os.path.join(temp_dir, 'ppt', '_rels'), exist_ok=True)
    os.makedirs(os.path.join(temp_dir, 'ppt', 'slides', '_rels'), exist_ok=True)
    os.makedirs(os.path.join(temp_dir, 'ppt', 'slideLayouts', '_rels'), exist_ok=True)
    os.makedirs(os.path.join(temp_dir, 'ppt', 'slideMasters', '_rels'), exist_ok=True)
    os.makedirs(os.path.join(temp_dir, 'ppt', 'theme'), exist_ok=True)
    os.makedirs(os.path.join(temp_dir, 'ppt', 'media'), exist_ok=True)

    # 1. [Content_Types].xml
    content_types = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
                     '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
                     '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
                     '<Default Extension="xml" ContentType="application/xml"/>',
                     '<Default Extension="jpg" ContentType="image/jpeg"/>',
                     '<Default Extension="png" ContentType="image/png"/>',
                     '<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>',
                     '<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>',
                     '<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>',
                     '<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>',
                     '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>',
                     '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>']
    for i in range(1, TOTAL_SLIDES + 1):
        content_types.append(f'<Override PartName="/ppt/slides/slide{i}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>')
    content_types.append('</Types>')

    with open(os.path.join(temp_dir, '[Content_Types].xml'), 'w', encoding='utf-8') as f:
        f.write('\n'.join(content_types))

    # 2. _rels/.rels
    with open(os.path.join(temp_dir, '_rels', '.rels'), 'w', encoding='utf-8') as f:
        f.write('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
                '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n'
                '  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>\n'
                '  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>\n'
                '  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>\n'
                '</Relationships>')

    # 3. docProps/core.xml & app.xml
    with open(os.path.join(temp_dir, 'docProps', 'core.xml'), 'w', encoding='utf-8') as f:
        f.write('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
                '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/">\n'
                '  <dc:title>XEdu Client 产品发布会 · 20分钟官方演示稿</dc:title>\n'
                '  <dc:creator>HAI Tech Lab / ReopenInnoLab</dc:creator>\n'
                '  <cp:lastModifiedBy>Antigravity AI</cp:lastModifiedBy>\n'
                '</cp:coreProperties>')

    with open(os.path.join(temp_dir, 'docProps', 'app.xml'), 'w', encoding='utf-8') as f:
        f.write('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
                '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">\n'
                '  <TotalTime>20</TotalTime>\n'
                f'  <Slides>{TOTAL_SLIDES}</Slides>\n'
                '  <Application>XEdu Keynote Engine</Application>\n'
                '</Properties>')

    # 4. ppt/presentation.xml (16:9 widescreen 12192000 x 6858000 EMU)
    pres_xml = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
                '<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">',
                '  <p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>',
                '  <p:sldIdLst>']
    for i in range(1, TOTAL_SLIDES + 1):
        pres_xml.append(f'    <p:sldId id="{255 + i}" r:id="rId{i + 1}"/>')
    pres_xml.append('  </p:sldIdLst>')
    pres_xml.append('  <p:sldSz cx="12192000" cy="6858000" type="screen16x9"/>')
    pres_xml.append('  <p:notesSz cx="6858000" cy="9144000"/>')
    pres_xml.append('</p:presentation>')

    with open(os.path.join(temp_dir, 'ppt', 'presentation.xml'), 'w', encoding='utf-8') as f:
        f.write('\n'.join(pres_xml))

    # ppt/_rels/presentation.xml.rels
    pres_rels = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
                 '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
                 '  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>']
    for i in range(1, TOTAL_SLIDES + 1):
        pres_rels.append(f'  <Relationship Id="rId{i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide{i}.xml"/>')
    pres_rels.append('</Relationships>')

    with open(os.path.join(temp_dir, 'ppt', '_rels', 'presentation.xml.rels'), 'w', encoding='utf-8') as f:
        f.write('\n'.join(pres_rels))

    # 5. SlideMaster & SlideLayout
    with open(os.path.join(temp_dir, 'ppt', 'slideMasters', 'slideMaster1.xml'), 'w', encoding='utf-8') as f:
        f.write('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
                '<p:sldMaster xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">\n'
                '  <p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld>\n'
                '  <p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>\n'
                '  <p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>\n'
                '</p:sldMaster>')

    with open(os.path.join(temp_dir, 'ppt', 'slideMasters', '_rels', 'slideMaster1.xml.rels'), 'w', encoding='utf-8') as f:
        f.write('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
                '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n'
                '  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>\n'
                '  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/>\n'
                '</Relationships>')

    with open(os.path.join(temp_dir, 'ppt', 'slideLayouts', 'slideLayout1.xml'), 'w', encoding='utf-8') as f:
        f.write('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
                '<p:sldLayout xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" type="blank" preserve="1">\n'
                '  <p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld>\n'
                '</p:sldLayout>')

    with open(os.path.join(temp_dir, 'ppt', 'slideLayouts', '_rels', 'slideLayout1.xml.rels'), 'w', encoding='utf-8') as f:
        f.write('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
                '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n'
                '  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/>\n'
                '</Relationships>')

    with open(os.path.join(temp_dir, 'ppt', 'theme', 'theme1.xml'), 'w', encoding='utf-8') as f:
        f.write('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
                '<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Dark Tech Theme">\n'
                '  <a:themeElements><a:clrScheme name="Dark"><a:dk1><a:srgbClr val="080C16"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="1E293B"/></a:dk2><a:lt2><a:srgbClr val="F8FAFC"/></a:lt2><a:accent1><a:srgbClr val="00D2FF"/></a:accent1><a:accent2><a:srgbClr val="3B82F6"/></a:accent2><a:accent3><a:srgbClr val="F59E0B"/></a:accent3><a:accent4><a:srgbClr val="10B981"/></a:accent4><a:accent5><a:srgbClr val="8B5CF6"/></a:accent5><a:accent6><a:srgbClr val="EC4899"/></a:accent6><a:hlink><a:srgbClr val="00D2FF"/></a:hlink><a:folHlink><a:srgbClr val="3B82F6"/></a:folHlink></a:clrScheme><a:fontScheme name="Standard"><a:majorFont><a:latin typeface="Arial"/></a:majorFont><a:minorFont><a:latin typeface="Arial"/></a:minorFont></a:fontScheme><a:fmtScheme name="Office"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements>\n'
                '</a:theme>')

    # 6. Copy AI slide images & generate slide XMLs
    for i in range(1, TOTAL_SLIDES + 1):
        img_name = f"slide_{i:02d}.jpg"
        src_img = os.path.join(SLIDES_DIR, img_name)
        dst_img = os.path.join(temp_dir, 'ppt', 'media', f"image{i}.jpg")

        if os.path.exists(src_img):
            shutil.copy(src_img, dst_img)
        else:
            print(f"Warning: Image {src_img} not found!")

        # slide{i}.xml with full-bleed image fitting 12192000 x 6858000
        slide_xml = f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr>
        <p:cNvPr id="1" name=""/>
        <p:cNvGrpSpPr/>
        <p:nvPr/>
      </p:nvGrpSpPr>
      <p:grpSpPr/>
      <p:pic>
        <p:nvPicPr>
          <p:cNvPr id="{i+1}" name="Slide Visual {i}"/>
          <p:cNvPicPr>
            <a:picLocks noChangeAspect="1"/>
          </p:cNvPicPr>
          <p:nvPr/>
        </p:nvPicPr>
        <p:blipFill>
          <a:blip r:embed="rId2"/>
          <a:stretch>
            <a:fillRect/>
          </a:stretch>
        </p:blipFill>
        <p:spPr>
          <a:xfrm>
            <a:off x="0" y="0"/>
            <a:ext cx="12192000" cy="6858000"/>
          </a:xfrm>
          <a:prstGeom prst="rect">
            <a:avLst/>
          </a:prstGeom>
        </p:spPr>
      </p:pic>
    </p:spTree>
  </p:cSld>
</p:sld>'''
        with open(os.path.join(temp_dir, 'ppt', 'slides', f"slide{i}.xml"), 'w', encoding='utf-8') as f:
            f.write(slide_xml)

        # slide{i}.xml.rels
        slide_rels = f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image{i}.jpg"/>
</Relationships>'''
        with open(os.path.join(temp_dir, 'ppt', 'slides', '_rels', f"slide{i}.xml.rels"), 'w', encoding='utf-8') as f:
            f.write(slide_rels)

    # 7. Zip package into final clean PPTX
    if os.path.exists(OUT_PPTX):
        os.remove(OUT_PPTX)

    with zipfile.ZipFile(OUT_PPTX, 'w', zipfile.ZIP_DEFLATED) as zout:
        for root, dirs, files in os.walk(temp_dir):
            for file in files:
                full_path = os.path.join(root, file)
                rel_path = os.path.relpath(full_path, temp_dir)
                zout.write(full_path, rel_path)

    print(f"SUCCESS: Built pristine clean PPTX at {OUT_PPTX}")
    shutil.rmtree(temp_dir)

if __name__ == '__main__':
    build_pristine_pptx()
