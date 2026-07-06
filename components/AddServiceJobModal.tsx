





import React, { useState, useEffect, useMemo } from 'react';
import { ServiceJob } from '../types.ts';
import { IconShieldCheck } from './icons.tsx';
import { Modal, ModalHeader, ModalFooter } from './Modal.tsx';
import { useAppData } from '../context/AppDataContext.tsx';
import { useToast } from '../context/ToastContext.tsx';
import { buildCustomerIndex, searchCustomers } from '../utils/customerLookup.ts';

interface AddServiceJobModalProps {
    onClose: () => void;
    onAdd: (newJob: Omit<ServiceJob, 'id' | 'status' | 'receivedDate'>) => void;
}

export const AddServiceJobModal: React.FC<AddServiceJobModalProps> = ({ onClose, onAdd }) => {
    const { transactions, warrantyLogs } = useAppData();
    const { addToast } = useToast();
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [showDropdown, setShowDropdown] = useState(false);
    const [warrantyAlert, setWarrantyAlert] = useState<{ type: 'valid' | 'expired' | 'info', message: string } | null>(null);

    const [formData, setFormData] = useState({
        customerName: '',
        customerPhone: '',
        vehicleDetails: '',
        issueDescription: '',
        estimatedCompletionDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        assignedTo: '',
        priority: 'Medium' as 'Low' | 'Medium' | 'High',
        loanerItemDetails: '',
        loanerStatus: 'Given' as 'Given' | 'Returned',
        isWarrantyClaim: false,
        warrantyCompany: '',
    });

    const customerIndex = useMemo(() => buildCustomerIndex(transactions), [transactions]);

    // Auto-search effect
    useEffect(() => {
        if (!searchQuery.trim()) {
            setSearchResults([]);
            setShowDropdown(false);
            return;
        }

        const query = searchQuery.toLowerCase();

        const matchedWarranties = warrantyLogs.filter(w =>
            w.serialNumber.toLowerCase().includes(query)
        ).map(w => ({ type: 'warranty' as const, data: w, label: `${w.serialNumber} - ${w.productName}` }));

        const matchedCustomers = searchCustomers(customerIndex, searchQuery).map(c => ({
            type: 'customer' as const,
            key: `${c.name}|${c.phone}`,
            data: c,
            label: `${c.name} (${c.phone})`,
        }));

        setSearchResults([...matchedWarranties, ...matchedCustomers]);
        setShowDropdown(true);
    }, [searchQuery, warrantyLogs, customerIndex]);

    const handleSelectResult = (result: any) => {
        if (result.type === 'warranty') {
            const w = result.data;
            setFormData(prev => ({
                ...prev,
                customerName: w.customerName,
                customerPhone: w.customerPhone,
                vehicleDetails: '', // Warranty log doesn't always have vehicle, could look up transaction
                issueDescription: `Issue with ${w.productName} (SN: ${w.serialNumber})`,
                isWarrantyClaim: true,
                warrantyCompany: w.productName.split(' ')[0] // Guess brand from name
            }));
            
            // Check warranty status
            const now = new Date();
            const guaranteeEnd = new Date(w.guaranteeEndDate);
            const warrantyEnd = new Date(w.warrantyEndDate);
            
            if (now <= guaranteeEnd) {
                setWarrantyAlert({ type: 'valid', message: `✅ In Guarantee (Free Replacement) until ${guaranteeEnd.toLocaleDateString()}` });
            } else if (now <= warrantyEnd) {
                setWarrantyAlert({ type: 'valid', message: `⚠️ In Pro-rata Warranty until ${warrantyEnd.toLocaleDateString()}` });
            } else {
                setWarrantyAlert({ type: 'expired', message: `❌ Warranty Expired on ${warrantyEnd.toLocaleDateString()}` });
            }

        } else if (result.type === 'customer') {
            const t = result.data;
            setFormData(prev => ({
                ...prev,
                customerName: t.name ?? t.customerName,
                customerPhone: t.phone ?? t.customerPhone ?? '',
                vehicleDetails: `${t.saleCategory ? `[${t.saleCategory}] ` : ''}${t.vehicleModel || ''} ${t.vehicleNo || t.vehicleNumber || ''}`.trim(),
            }));
            setWarrantyAlert(null);
        }
        setShowDropdown(false);
        setSearchQuery('');
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, checked } = e.target;
        setFormData(prev => ({ ...prev, [name]: checked }));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.customerName || !formData.customerPhone || !formData.issueDescription) {
            addToast('Please fill all required fields.', 'warning');
            return;
        }
        
        const jobData: any = { ...formData };
        if (!jobData.loanerItemDetails) {
            delete jobData.loanerStatus;
        }
        
        if (formData.isWarrantyClaim) {
            jobData.warrantyClaim = {
                isClaim: true,
                companyName: formData.warrantyCompany,
                status: 'Sent to Company'
            };
        }
        delete jobData.isWarrantyClaim;
        delete jobData.warrantyCompany;

        onAdd(jobData);
        onClose();
    };

    return (
        <Modal onClose={onClose} size="lg" ariaLabel="Add New Service Job">
            <ModalHeader title="Add New Service Job" onClose={onClose} />
                
                <div className="p-6 pb-0 relative">
                    <div className="relative">
                        <label className="text-xs font-bold text-brand-red uppercase tracking-wide mb-1 block">Smart Lookup</label>
                        <input 
                            type="text" 
                            placeholder="🔍 Search Serial Number, Customer Name or Phone..." 
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className="form-input border-brand-red/30 focus:border-brand-red"
                        />
                        {showDropdown && searchResults.length > 0 && (
                            <ul className="absolute z-20 w-full bg-bg-secondary border border-border-color rounded-b-lg shadow-xl max-h-48 overflow-y-auto mt-1">
                                {searchResults.map((res, idx) => (
                                    <li key={idx} onMouseDown={() => handleSelectResult(res)} className="p-3 hover:bg-bg-tertiary cursor-pointer border-b border-border-color last:border-0">
                                        <p className="font-bold text-sm text-text-primary">{res.label}</p>
                                        <p className="text-xs text-text-muted capitalize">{res.type} Record</p>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                    {warrantyAlert && (
                        <div className={`mt-3 p-3 rounded-lg text-sm font-bold flex items-center gap-2 ${warrantyAlert.type === 'expired' ? 'bg-status-red-bg text-status-red-text' : 'bg-status-green-bg text-status-green-text'}`}>
                            <IconShieldCheck className="h-5 w-5" />
                            {warrantyAlert.message}
                        </div>
                    )}
                </div>

                <form onSubmit={handleSubmit} className="p-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                         <div className="form-group"><label>Customer Name</label><input type="text" name="customerName" value={formData.customerName} onChange={handleInputChange} required /></div>
                         <div className="form-group"><label>Customer Phone</label><input type="tel" name="customerPhone" value={formData.customerPhone} onChange={handleInputChange} required /></div>
                         <div className="form-group md:col-span-2"><label>Vehicle Details</label><input type="text" name="vehicleDetails" value={formData.vehicleDetails} onChange={handleInputChange} placeholder="e.g., Maruti Swift (DL-5C-1234)" /></div>
                         <div className="form-group md:col-span-2"><label>Issue Description</label><textarea name="issueDescription" value={formData.issueDescription} onChange={handleInputChange} required rows={3}></textarea></div>
                         <div className="form-group"><label>Est. Completion Date</label><input type="date" name="estimatedCompletionDate" value={formData.estimatedCompletionDate} onChange={handleInputChange} /></div>
                         <div className="form-group">
                             <label>Priority</label>
                             <select name="priority" value={formData.priority} onChange={handleInputChange}>
                                 <option value="Low">Low</option>
                                 <option value="Medium">Medium</option>
                                 <option value="High">High</option>
                             </select>
                         </div>
                         <div className="form-group md:col-span-2"><label>Assigned To</label><input type="text" name="assignedTo" value={formData.assignedTo} onChange={handleInputChange} /></div>
                         
                         <div className="form-group md:col-span-2 border-t border-border-color pt-2 mt-2">
                             <label className="text-blue-500 font-semibold">Standby Battery (Loaner)</label>
                             <input type="text" name="loanerItemDetails" value={formData.loanerItemDetails} onChange={handleInputChange} placeholder="e.g. Exide 100Ah (Old) - S/N 123" />
                         </div>

                         <div className="form-group md:col-span-2 pt-2">
                             <div className="flex items-center gap-2">
                                <input type="checkbox" id="isWarrantyClaim" name="isWarrantyClaim" checked={formData.isWarrantyClaim} onChange={handleCheckboxChange} className="h-4 w-4" />
                                <label htmlFor="isWarrantyClaim" className="text-brand-red font-semibold cursor-pointer">Is this a Company Warranty Claim (RMA)?</label>
                             </div>
                             {formData.isWarrantyClaim && (
                                 <input type="text" name="warrantyCompany" value={formData.warrantyCompany} onChange={handleInputChange} placeholder="Company Name (e.g. Exide, Amaron)" className="mt-2" />
                             )}
                         </div>
                    </div>
                    <ModalFooter>
                        <div className="flex gap-3 ml-auto">
                            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
                            <button type="submit" className="btn-primary">Add Job</button>
                        </div>
                    </ModalFooter>
                </form>
        </Modal>
    );
};