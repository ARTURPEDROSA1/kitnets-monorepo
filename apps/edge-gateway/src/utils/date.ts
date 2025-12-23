export function getLocalDateStr(d?: Date): string {
    const date = d || new Date();
    // Returns YYYY-MM-DD in LOCAL time (OS time), not UTC.
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}
