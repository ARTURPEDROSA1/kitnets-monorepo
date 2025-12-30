
import csv
import sys
from datetime import datetime

# Input/Output paths
INPUT_FILE = r"C:\Users\Administrator\Documents\Kitnets\fipezap-serieshistoricas.csv"
OUTPUT_FILE = r"C:\Users\Administrator\Documents\Kitnets\apps\web\database\seed_fipezap.sql"

# Month mapping (English short -> Month number)
MONTH_MAP = {
    'Jan': 1, 'Feb': 2, 'Mar': 3, 'Apr': 4, 'May': 5, 'Jun': 6,
    'Jul': 7, 'Aug': 8, 'Sep': 9, 'Oct': 10, 'Nov': 11, 'Dec': 12
}

def parse_date(date_str):
    try:
        # Expected format like "Jan-08" or "jan-08"
        parts = date_str.strip().split('-')
        if len(parts) != 2:
            return None
        month_str = parts[0].capitalize()
        year_short = parts[1]
        
        # Handle 2-digit year
        year = int(year_short)
        if year > 50:
            year += 1900
        else:
            year += 2000
            
        month = MONTH_MAP.get(month_str)
        if not month:
            return None
            
        return f"{year}-{month:02d}-01"
    except Exception as e:
        print(f"Error parsing date {date_str}: {e}")
        return None

def clean_value(val_str):
    if not val_str or val_str.strip() == '.' or val_str.strip() == '':
        return None
    
    clean = val_str.strip()
    clean = clean.replace('%', '')
    clean = clean.replace('R$', '')
    clean = clean.replace('"', '') # Remove quotes introduced by CSV for formatted numbers
    
    # Handle European/Brazilian number format: 2.226 -> 2226, 0,61 -> 0.61
    # However, looking at the CSV snippet:
    # "2,226" -> This looks like thousands separator is comma? Or decimal is comma?
    # Snippet: "2,226" (for 2226.0 presumably) 
    # Snippet: "+0.61%" (decimal is dot)
    # Snippet: "0.64%" (decimal is dot)
    # Snippet: "13.2" (decimal is dot)
    # WAIT. The header snippet shows: "2,226", "2,411". This is usually 2 thousand.
    # But later "+0.61%".
    # And row 4: "13.2", "15.8".
    # Let's handle generic cleaning:
    # If it contains ',' and '.' -> assume '.' is thousand, ',' is decimal?
    # Visual check: "2,226" for Price m2 in 2008. reasonable value 2226 BRL.
    # "0.61%" -> 0.61.
    # It seems mixed or valid CSV parsing handles the quotes. 
    # Let's assume standard programming float: dots for decimals, commas for thousands (to be removed).
    
    # Let's detect:
    # In CSV: "2,226" -> Quotes mean it contains a comma. 2,226 is likely 2226.
    # +0.61% -> 0.61.
    
    clean = clean.replace(',', '') # Remove commas (thousands)
    
    try:
        return float(clean)
    except:
        return None

# Column mappings
# index_type, metric, start_col (0-based)
# Each block has 5 columns: Total, 1, 2, 3, 4
MAPPINGS = [
    # Venda
    ('venda', 'var_mensal', 1),
    ('venda', 'var_12m', 6),
    ('venda', 'preco_m2', 11),
    
    # Locacao (Assuming generic structure continues)
    ('locacao', 'var_mensal', 16),
    ('locacao', 'var_12m', 21),
    ('locacao', 'preco_m2', 26),
    
    # Yield
    ('yield', 'yield_mensal', 31)
]

DORM_OFFSETS = [
    (0, 'total'),
    (1, '1'),
    (2, '2'),
    (3, '3'),
    (4, '4')
]

def main():
    print(f"Reading {INPUT_FILE}...")
    
    sql_statements = []
    
    with open(INPUT_FILE, 'rt', encoding='utf-8', errors='replace') as f:
        reader = csv.reader(f)
        
        # Skip headers
        next(reader) # Row 1
        next(reader) # Row 2
        next(reader) # Row 3
        # Row 4 is headers "Data, Total, 1D..." -> used for verification but we know structure
        headers = next(reader)
        
        row_count = 0
        insert_count = 0
        
        for row in reader:
            if not row or len(row) < 1:
                continue
                
            date_str = row[0]
            db_date = parse_date(date_str)
            
            if not db_date:
                # header or empty line
                continue
                
            row_count += 1
            
            for index_type, metric, start_col in MAPPINGS:
                for offset, dorm in DORM_OFFSETS:
                    col_idx = start_col + offset
                    
                    if col_idx >= len(row):
                        continue
                        
                    raw_val = row[col_idx]
                    val = clean_value(raw_val)
                    
                    if val is not None:
                        # Construct VALUES tuple
                        # (reference_date, index_type, metric, dormitorios, value)
                        sql = f"INSERT INTO fipezap_series (reference_date, index_type, metric, dormitorios, value) VALUES ('{db_date}', '{index_type}', '{metric}', '{dorm}', {val}) ON CONFLICT DO NOTHING;"
                        sql_statements.append(sql)
                        insert_count += 1
                        
    print(f"Processed {row_count} rows.")
    print(f"Generated {insert_count} SQL statements.")
    
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        f.write("-- Seed data for FipeZap Series\n")
        f.write("\n".join(sql_statements))
        
    print(f"Saved to {OUTPUT_FILE}")

if __name__ == "__main__":
    main()
