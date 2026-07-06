import React from 'react';

interface PaginationBarProps {
    currentPage: number;
    totalPages: number;
    onPageChange: (page: number) => void;
    itemsPerPage?: number;
    onItemsPerPageChange?: (size: number) => void;
    pageSizeOptions?: number[];
}

export const PaginationBar: React.FC<PaginationBarProps> = ({
    currentPage,
    totalPages,
    onPageChange,
    itemsPerPage,
    onItemsPerPageChange,
    pageSizeOptions = [10, 25, 50],
}) => {
    if (totalPages <= 1 && !onItemsPerPageChange) return null;

    return (
        <div className="flex flex-col sm:flex-row justify-between items-center gap-3 pt-4 mt-4 border-t border-border-color text-sm">
            <div className="flex items-center gap-2">
                {onItemsPerPageChange && itemsPerPage !== undefined && (
                    <>
                        <label htmlFor="page-size" className="text-text-muted text-xs">Show</label>
                        <select
                            id="page-size"
                            value={itemsPerPage}
                            onChange={e => onItemsPerPageChange(Number(e.target.value))}
                            className="form-input py-1 px-2 text-sm w-auto"
                        >
                            {pageSizeOptions.map(n => (
                                <option key={n} value={n}>{n}</option>
                            ))}
                        </select>
                        <span className="text-text-muted text-xs">per page</span>
                    </>
                )}
            </div>
            {totalPages > 1 && (
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => onPageChange(currentPage - 1)}
                        disabled={currentPage === 1}
                        className="btn-secondary btn-sm min-h-[2.5rem] min-w-[5.5rem] disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        Previous
                    </button>
                    <span className="text-text-muted font-medium tabular-nums px-1">
                        {currentPage} / {totalPages}
                    </span>
                    <button
                        onClick={() => onPageChange(currentPage + 1)}
                        disabled={currentPage === totalPages}
                        className="btn-secondary btn-sm min-h-[2.5rem] min-w-[5.5rem] disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        Next
                    </button>
                </div>
            )}
        </div>
    );
};
