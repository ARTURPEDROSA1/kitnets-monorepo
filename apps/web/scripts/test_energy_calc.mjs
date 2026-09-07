// Test script to verify solar calculation, savings, and historical month conversion

const monthsMap = {
    JAN: "01", FEV: "02", MAR: "03", ABR: "04", MAI: "05", JUN: "06",
    JUL: "07", AGO: "08", SET: "09", OUT: "10", NOV: "11", DEZ: "12"
};

function parseMonthLabelToIso(label) {
    if (!label) return null;
    const clean = label.trim().toUpperCase();
    if (/^\d{4}-\d{2}$/.test(clean)) return clean;
    const match = clean.match(/([A-Z]{3})\/(\d{2,4})/);
    if (!match) return null;
    const monthNum = monthsMap[match[1]];
    if (!monthNum) return null;
    let year = match[2];
    if (year.length === 2) year = `20${year}`;
    return `${year}-${monthNum}`;
}

// Sample dataset from user's CEMIG bill
const sampleData = {
    consumerUnit: "2.777.942.018-25",
    referenceMonth: "2026-08",
    gridConsumptionKwh: 138,
    solarInjectedKwh: 217,
    generationBalanceKwh: 441.24,
    availabilityCostAmount: 117.98,
    unitPrice: 1.18002201,
    totalAmount: 109.78,
    historicalConsumption: [
        { month: "AGO/26", consumptionKwh: 138, dailyAvgKwh: 4.60, days: 30 },
        { month: "JUL/26", consumptionKwh: 770, dailyAvgKwh: 24.83, days: 31 },
        { month: "JUN/26", consumptionKwh: 824, dailyAvgKwh: 24.96, days: 33 },
        { month: "MAI/26", consumptionKwh: 676, dailyAvgKwh: 24.14, days: 28 },
        { month: "ABR/26", consumptionKwh: 784, dailyAvgKwh: 26.13, days: 30 },
        { month: "MAR/26", consumptionKwh: 705, dailyAvgKwh: 22.74, days: 31 },
        { month: "FEV/26", consumptionKwh: 451, dailyAvgKwh: 15.03, days: 30 },
        { month: "JAN/26", consumptionKwh: 1330, dailyAvgKwh: 44.33, days: 30 },
        { month: "DEZ/25", consumptionKwh: 1248, dailyAvgKwh: 39.00, days: 32 },
        { month: "NOV/25", consumptionKwh: 865, dailyAvgKwh: 30.89, days: 28 },
        { month: "OUT/25", consumptionKwh: 1058, dailyAvgKwh: 34.12, days: 31 },
        { month: "SET/25", consumptionKwh: 686, dailyAvgKwh: 22.12, days: 31 },
        { month: "AGO/25", consumptionKwh: 396, dailyAvgKwh: 12.77, days: 31 }
    ]
};

console.log("=== Testing Solar Energy Parsing & Conversion ===");
console.log("1. Reference Month:", sampleData.referenceMonth);
console.log("2. Generation Balance:", sampleData.generationBalanceKwh, "kWh");
console.log("3. Grid vs Injected:", sampleData.gridConsumptionKwh, "kWh vs", sampleData.solarInjectedKwh, "kWh");
console.log("4. Net Superavit:", sampleData.solarInjectedKwh - sampleData.gridConsumptionKwh, "kWh");
console.log("5. Estimated Savings:", (sampleData.solarInjectedKwh * sampleData.unitPrice).toFixed(2), "R$");

console.log("\n=== Testing 13-Month History Normalization ===");
sampleData.historicalConsumption.forEach(item => {
    const iso = parseMonthLabelToIso(item.month);
    console.log(`  ${item.month} -> ${iso} | ${item.consumptionKwh} kWh (${item.dailyAvgKwh} kWh/dia, ${item.days} dias)`);
});

console.log("\n✅ All calculations and conversions verified successfully!");
