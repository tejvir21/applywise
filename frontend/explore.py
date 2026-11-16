import os
frontend = r'D:\tej data\MINE\applywise\frontend'
print("Frontend contents:")
for item in os.listdir(frontend):
    full = os.path.join(frontend, item)
    if os.path.isdir(full):
        print(f"  DIR: {item}")
    else:
        print(f"  FILE: {item}")