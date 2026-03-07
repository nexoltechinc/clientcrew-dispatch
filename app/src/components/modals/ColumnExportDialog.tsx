import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { ExportFormat } from '@/lib/export';

interface ColumnExportDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    description?: string;
    availableColumns: string[];
    defaultSelectedColumns?: string[];
    onConfirm: (selectedColumns: string[], format?: ExportFormat) => void;
}

export default function ColumnExportDialog({
    open,
    onOpenChange,
    title,
    description,
    availableColumns,
    defaultSelectedColumns,
    onConfirm,
}: ColumnExportDialogProps) {
    const normalizedDefaultSelection = useMemo(() => {
        if (!defaultSelectedColumns || defaultSelectedColumns.length === 0) {
            return availableColumns;
        }

        const validDefaults = defaultSelectedColumns.filter((column) => availableColumns.includes(column));
        return validDefaults.length > 0 ? validDefaults : availableColumns;
    }, [availableColumns, defaultSelectedColumns]);

    const [selectedColumns, setSelectedColumns] = useState<string[]>(normalizedDefaultSelection);
    const [selectedFormat, setSelectedFormat] = useState<ExportFormat>('csv');

    useEffect(() => {
        if (open) {
            setSelectedColumns(normalizedDefaultSelection);
            setSelectedFormat('csv');
        }
    }, [open, normalizedDefaultSelection]);

    const selectedCount = selectedColumns.length;

    const toggleColumn = (column: string, checked: boolean) => {
        if (checked) {
            setSelectedColumns((prev) => {
                if (prev.includes(column)) return prev;
                return availableColumns.filter((item) => item === column || prev.includes(item));
            });
            return;
        }

        setSelectedColumns((prev) => prev.filter((item) => item !== column));
    };

    const handleExport = () => {
        if (selectedColumns.length === 0) {
            alert('Please select at least one column to export.');
            return;
        }

        onConfirm(selectedColumns, selectedFormat);
        onOpenChange(false);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="w-[calc(100%-1.5rem)] max-w-[36rem] p-0 sm:max-w-[36rem]">
                <DialogHeader className="px-6 pt-6">
                    <DialogTitle>{title}</DialogTitle>
                    <DialogDescription>
                        {description || 'Select the columns you want to include in the CSV export.'}
                    </DialogDescription>
                </DialogHeader>

                <div className="flex max-h-[65vh] min-h-0 flex-col gap-3 px-6">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                        <span>{selectedCount} of {availableColumns.length} columns selected</span>
                        <div className="flex items-center gap-2">
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-xs"
                                onClick={() => setSelectedColumns(availableColumns)}
                            >
                                Select all
                            </Button>
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-xs"
                                onClick={() => setSelectedColumns([])}
                            >
                                Clear all
                            </Button>
                        </div>
                    </div>

                    <ScrollArea className="min-h-0 flex-1 pr-1">
                        <div className="grid grid-cols-1 gap-2">
                            {availableColumns.map((column) => {
                                const id = `export-column-${column.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}`;
                                return (
                                    <label key={column} htmlFor={id} className="flex items-center gap-3 rounded-md border border-border px-3 py-2 cursor-pointer hover:bg-muted/30">
                                        <Checkbox
                                            id={id}
                                            checked={selectedColumns.includes(column)}
                                            onCheckedChange={(checked) => toggleColumn(column, checked === true)}
                                        />
                                        <span className="font-normal text-sm">
                                            {column}
                                        </span>
                                    </label>
                                );
                            })}
                        </div>
                    </ScrollArea>
                </div>

                <DialogFooter className="border-t px-6 py-4">
                    <div className="mr-auto flex items-center gap-1 rounded-md border border-border p-1">
                        <Button
                            type="button"
                            size="sm"
                            variant={selectedFormat === 'csv' ? 'default' : 'ghost'}
                            className="h-8 px-3"
                            onClick={() => setSelectedFormat('csv')}
                        >
                            CSV
                        </Button>
                        <Button
                            type="button"
                            size="sm"
                            variant={selectedFormat === 'excel' ? 'default' : 'ghost'}
                            className="h-8 px-3"
                            onClick={() => setSelectedFormat('excel')}
                        >
                            Excel
                        </Button>
                    </div>
                    <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button type="button" className="min-w-28" onClick={handleExport}>
                        {selectedFormat === 'excel' ? 'Export Excel' : 'Export CSV'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
