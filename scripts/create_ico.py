from PIL import Image
import os

def create_ico(source_png, output_ico):
    img = Image.open(source_png)
    # Ensure it's RGBA
    if img.mode != 'RGBA':
        img = img.convert('RGBA')

    sizes = [(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)]
    images = []
    for size in sizes:
        # Use high quality downsampling
        resized = img.resize(size, Image.Resampling.LANCZOS)
        images.append(resized)

    # Save as ICO. The first image is the primary one, others are appended.
    # Note: Pillow's ICO save can handle this if we pass the list.
    # Actually, the 'sizes' parameter in save(format='ICO') tells it which sizes to embed if we pass a single image, 
    # but to control the quality of each resize, it's better to pass the resized images explicitly via append_images?
    # Wait, Pillow documentation for ICO: 
    # "The sizes parameter ... is ignored if the file is being written."
    # "append_images: A list of images to append as additional pages."
    
    images[0].save(output_ico, format='ICO', append_images=images[1:])
    print(f"Created {output_ico} with multiple sizes.")

if __name__ == '__main__':
    # Use absolute paths or relative to cwd
    cwd = os.getcwd()
    source = os.path.join(cwd, 'resources', 'icon-256.png')
    target = os.path.join(cwd, 'resources', 'app.ico')
    
    print(f"Source: {source}")
    print(f"Target: {target}")
    
    if not os.path.exists(source):
        print("Source image not found!")
        exit(1)
        
    create_ico(source, target)
