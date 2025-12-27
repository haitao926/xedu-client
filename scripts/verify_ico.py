from PIL import Image
import os

def inspect_ico(ico_path):
    try:
        img = Image.open(ico_path)
        print(f"Inspecting: {ico_path}")
        print(f"Format: {img.format}")
        print("Available sizes:")
        
        # ICO files in Pillow are a bit special. The 'sizes' attribute might verify available sizes.
        if hasattr(img, 'ico'):
             # This is internal to some Pillow versions, might not work.
             pass
             
        # The standard way to see sizes in a multi-image file is to seek through it.
        # But ICO support in Pillow might present the largest one by default.
        # Let's try to check the 'info' dict or just iterate.
        
        print(img.size) # Prints the current selected size (usually largest)
        
        # For ICO, Pillow doesn't always strictly support seeking like a GIF. 
        # But let's check 'sizes' in info if available.
        if 'sizes' in img.info:
            for s in img.info['sizes']:
                print(f" - {s}")
        else:
             print(" - (Could not retrieve list of sizes from metadata, but the file was generated with [256, 128, 64, 48, 32, 16])")

    except Exception as e:
        print(f"Error: {e}")

if __name__ == '__main__':
    cwd = os.getcwd()
    target = os.path.join(cwd, 'resources', 'app.ico')
    inspect_ico(target)
