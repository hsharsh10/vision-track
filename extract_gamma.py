import re
import json

with open('gamma.html', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Search for Next.js data
matches = re.findall(r'<script[^>]*id="__NEXT_DATA__"[^>]*>(.*?)</script>', content, re.DOTALL)
if matches:
    print("Found __NEXT_DATA__! Length:", len(matches[0]))
    try:
        data = json.loads(matches[0])
        with open('next_data.json', 'w', encoding='utf-8') as out:
            json.dump(data, out, indent=2)
        print("Successfully written next_data.json")
    except Exception as e:
        print("JSON parse error:", e)

# 2. Search for any script containing document data
for m in re.finditer(r'<script[^>]*>(.*?)</script>', content, re.DOTALL):
    text = m.group(1)
    if 'Indias-Multimodal' in text or 'multimodal' in text.lower() or 'decision engine' in text.lower():
        print("Found matching script tag, length:", len(text))
        with open('matched_script.txt', 'w', encoding='utf-8') as out:
            out.write(text[:50000])

# 3. Simple regex to extract cards / blocks / slide texts
print("Done scan.")
