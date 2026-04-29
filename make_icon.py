import struct, os, io

src_png = r'C:\Users\ssang\.gemini\antigravity\brain\5c667455-4d56-44f7-accf-e03fce7e5dd1\fit_app_icon_1777491553780.png'
ico_path = r'fit-app\src-tauri\icons\icon.ico'
os.makedirs(os.path.dirname(ico_path), exist_ok=True)

try:
    from PIL import Image
    sizes = [16, 32, 48, 64, 128, 256]
    img = Image.open(src_png).convert('RGBA')
    images = []
    for s in sizes:
        resized = img.resize((s, s), Image.LANCZOS)
        buf = io.BytesIO()
        resized.save(buf, format='PNG')
        images.append(buf.getvalue())
    print('Using Pillow')
except ImportError:
    with open(src_png, 'rb') as f:
        png_data = f.read()
    images = [png_data]
    sizes = [256]
    print('Pillow not available, using single 256x256')

num = len(images)
offset = 6 + 16 * num
header = struct.pack('<HHH', 0, 1, num)
directory = b''
for i, (s, data) in enumerate(zip(sizes, images)):
    w = 0 if s == 256 else s
    h = 0 if s == 256 else s
    directory += struct.pack('<BBBBHHII', w, h, 0, 0, 1, 32, len(data), offset)
    offset += len(data)

with open(ico_path, 'wb') as f:
    f.write(header + directory)
    for data in images:
        f.write(data)

print(f'Written: {os.path.getsize(ico_path)} bytes -> {ico_path}')
