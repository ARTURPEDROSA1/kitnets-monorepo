
import os

INPUT_FILE = r"C:\Users\Administrator\Documents\Kitnets\apps\web\database\seed_fipezap.sql"
OUTPUT_DIR = r"C:\Users\Administrator\Documents\Kitnets\apps\web\database"
LINES_PER_FILE = 1000

def main():
    print(f"Reading {INPUT_FILE}...")
    
    with open(INPUT_FILE, 'r', encoding='utf-8') as f:
        lines = f.readlines()
        
    total_lines = len(lines)
    print(f"Total lines: {total_lines}")
    
    # Filter only INSERT lines to avoid splitting headers/comments if any (though currently it's mostly inserts)
    # Actually, simplistic chunking is fine as the file is just a list of INSERT statements.
    
    current_part = 1
    for i in range(0, total_lines, LINES_PER_FILE):
        chunk = lines[i:i + LINES_PER_FILE]
        
        output_filename = os.path.join(OUTPUT_DIR, f"seed_fipezap_part{current_part}.sql")
        with open(output_filename, 'w', encoding='utf-8') as out_f:
            if current_part == 1:
                # Keep the header comment in the first file
                pass
            out_f.writelines(chunk)
            
        print(f"Created {output_filename} ({len(chunk)} lines)")
        current_part += 1

    print("Splitting complete.")

if __name__ == "__main__":
    main()
