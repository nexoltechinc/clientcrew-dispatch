import * as XLSX from 'xlsx';

export type ExportRow = Record<string, unknown>;
export type ExportFormat = 'csv' | 'excel';

export function selectColumnsForExport<T extends ExportRow>(data: T[], selectedColumns: string[]): ExportRow[] {
    if (!Array.isArray(selectedColumns) || selectedColumns.length === 0) {
        return [];
    }

    return data.map((row) => {
        const selected: ExportRow = {};
        selectedColumns.forEach((column) => {
            selected[column] = row[column];
        });
        return selected;
    });
}

export function convertArrayToCSV<T extends object>(data: T[], filename: string) {
    if (!data || data.length === 0) {
        alert("No data to export.");
        return;
    }

    // Get headers from the first object keys
    const headers = Object.keys(data[0]);

    // Create CSV content
    const csvContent = [
        headers.join(','), // Header row
        ...data.map(row =>
            headers.map(fieldName => {
                const value = (row as any)[fieldName];

                if (value === null || value === undefined) {
                    return '';
                }

                // Handle strings with commas or quotes by wrapping in quotes and escaping internal quotes
                if (typeof value === 'string') {
                    return `"${value.replace(/"/g, '""')}"`;
                }

                if (typeof value === 'boolean') {
                    return value ? 'Yes' : 'No';
                }

                // Handle arrays (like zones or skills)
                if (Array.isArray(value)) {
                    return `"${value.join('; ')}"`;
                }
                // Handle objects (basic JSON stringify for now, or just [Object])
                if (typeof value === 'object' && value !== null) {
                    return `"${JSON.stringify(value).replace(/"/g, '""')}"`;
                }
                return `${value}`;
            }).join(',')
        )
    ].join('\n');

    // Trigger download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    if (link.download !== undefined) {
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `${filename}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
}

export function convertArrayToExcel<T extends object>(data: T[], filename: string) {
    if (!data || data.length === 0) {
        alert("No data to export.");
        return;
    }

    const normalized = data.map((row) => {
        const next: Record<string, unknown> = {};
        Object.entries(row).forEach(([key, value]) => {
            if (value === null || value === undefined) {
                next[key] = '';
            } else if (typeof value === 'boolean') {
                next[key] = value ? 'Yes' : 'No';
            } else if (Array.isArray(value)) {
                next[key] = value.join('; ');
            } else if (typeof value === 'object') {
                next[key] = JSON.stringify(value);
            } else {
                next[key] = value;
            }
        });
        return next;
    });

    const worksheet = XLSX.utils.json_to_sheet(normalized);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Export');
    XLSX.writeFile(workbook, `${filename}.xlsx`);
}

export function exportArrayData<T extends object>(data: T[], filename: string, format: ExportFormat = 'csv') {
    if (format === 'excel') {
        convertArrayToExcel(data, filename);
        return;
    }
    convertArrayToCSV(data, filename);
}
