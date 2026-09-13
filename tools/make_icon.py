"""App icon: dark plate, crimson diamond, the game's sword icon on top. Writes build/icon.png, build/icon.ico, resources/game/app-icon.png."""
import os
from PIL import Image, ImageDraw, ImageFilter

root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
S = 512
img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
d = ImageDraw.Draw(img)
d.rounded_rectangle((16, 16, S - 16, S - 16), radius=96, fill=(22, 14, 14, 255), outline=(70, 46, 46, 255), width=6)
# diamond glow
glow = Image.new('RGBA', (S, S), (0, 0, 0, 0))
gd = ImageDraw.Draw(glow)
c = S // 2
gd.polygon([(c, 70), (S - 70, c), (c, S - 70), (70, c)], fill=(193, 39, 45, 255))
glow = glow.filter(ImageFilter.GaussianBlur(28))
img.alpha_composite(glow)
d = ImageDraw.Draw(img)
d.polygon([(c, 96), (S - 96, c), (c, S - 96), (96, c)], fill=(150, 26, 32, 255), outline=(212, 162, 76, 255), width=8)
sword = Image.open(os.path.join(root, 'resources', 'game', 'icons', '1000578.webp')).convert('RGBA').resize((300, 300), Image.LANCZOS)
sh = Image.new('RGBA', (S, S), (0, 0, 0, 0))
sh.paste(Image.new('RGBA', sword.size, (0, 0, 0, 200)), (c - 150 + 6, c - 150 + 10), sword)
sh = sh.filter(ImageFilter.GaussianBlur(8))
img.alpha_composite(sh)
img.alpha_composite(sword, (c - 150, c - 150))
os.makedirs(os.path.join(root, 'build'), exist_ok=True)
img.save(os.path.join(root, 'build', 'icon.png'))
img.save(os.path.join(root, 'resources', 'game', 'app-icon.png'))
img.save(os.path.join(root, 'build', 'icon.ico'), sizes=[(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)])
print('icon written')
