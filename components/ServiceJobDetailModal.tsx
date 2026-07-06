
import React, { useState } from 'react';
import { ServiceJob, ServiceJobStatus, WarrantyLog } from '../types.ts';
import { IconDownload } from './icons.tsx';
import { useConfig } from '../context/ConfigContext.tsx';
import { useAppData } from '../context/AppDataContext.tsx';
import { generateWarrantyClaimPdf } from '../utils/warrantyClaimPdf.ts';
import { Modal, ModalHeader, ModalFooter } from './Modal.tsx';

interface ServiceJobDetailModalProps {
    job: ServiceJob;
    onClose: () => void;
    onUpdate: (updatedJob: ServiceJob) => void;
}

export const ServiceJobDetailModal: React.FC<ServiceJobDetailModalProps> = ({ job, onClose, onUpdate }) => {
    const { defaultFirm, config } = useConfig();
    const { warrantyLogs } = useAppData();
    const [isEditing, setIsEditing] = useState(false);
    const [formData, setFormData] = useState<ServiceJob>(job);

    const linkedWarranty = warrantyLogs.find(w => w.id === formData.warrantyClaim?.warrantyLogId);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleClaimChange = (field: string, value: string | boolean) => {
        setFormData(prev => ({
            ...prev,
            warrantyClaim: {
                isClaim: prev.warrantyClaim?.isClaim ?? false,
                ...prev.warrantyClaim,
                [field]: value,
            },
        }));
    };

    const handleSave = () => {
        onUpdate(formData);
        setIsEditing(false);
    };

    const handleGenerateClaimPdf = () => {
        const firm = config.firms.find(f => f.id === config.preferences.defaultFirmId) || config.firms[0];
        generateWarrantyClaimPdf(formData, linkedWarranty, firm);
        onUpdate({
            ...formData,
            warrantyClaim: {
                ...formData.warrantyClaim,
                isClaim: true,
                claimDocumentGeneratedAt: new Date().toISOString(),
            },
        });
    };

    const customerWarrantyLogs = warrantyLogs.filter(
        w => w.customerPhone === formData.customerPhone || w.customerName === formData.customerName
    );

    const renderField = (label: string, value: React.ReactNode) => (
        <div>
            <p className="text-xs font-semibold text-text-muted uppercase">{label}</p>
            <p className="text-text-primary">{value || 'N/A'}</p>
        </div>
    );

    return (
        <Modal onClose={onClose} size="lg" ariaLabel={`Job Details: ${job.id}`}>
            <ModalHeader title={`Job Details: ${job.id}`} onClose={onClose} />

                <div className="flex-1 overflow-y-auto p-6 space-y-4 max-h-[60vh]">
                    {isEditing ? (
                        <div className="grid grid-cols-2 gap-4">
                            <input type="text" name="customerName" value={formData.customerName} onChange={handleInputChange} className="form-input col-span-1" placeholder="Customer Name" />
                            <input type="text" name="customerPhone" value={formData.customerPhone} onChange={handleInputChange} className="form-input col-span-1" placeholder="Phone" />
                            <input type="text" name="vehicleDetails" value={formData.vehicleDetails} onChange={handleInputChange} className="form-input col-span-2" placeholder="Vehicle Details" />
                            <textarea name="issueDescription" value={formData.issueDescription} onChange={handleInputChange} className="form-input col-span-2" rows={3} placeholder="Issue Description"></textarea>
                            <input type="text" name="assignedTo" value={formData.assignedTo || ''} onChange={handleInputChange} className="form-input col-span-1" placeholder="Assigned To" />
                             <select name="status" value={formData.status} onChange={handleInputChange} className="form-input col-span-1">
                                {Object.values(ServiceJobStatus).map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                            <select name="priority" value={formData.priority || 'Medium'} onChange={handleInputChange} className="form-input col-span-1">
                                <option value="Low">Low</option>
                                <option value="Medium">Medium</option>
                                <option value="High">High</option>
                            </select>
                            <input type="number" name="chargeAmount" value={formData.chargeAmount || ''} onChange={handleInputChange} className="form-input col-span-1" placeholder="Charge Amount" />
                            <div className="col-span-2 grid grid-cols-2 gap-4 border-t border-border-color pt-2 mt-2">
                                <input type="text" name="loanerItemDetails" value={formData.loanerItemDetails || ''} onChange={handleInputChange} className="form-input col-span-1" placeholder="Loaner Details" />
                                <select name="loanerStatus" value={formData.loanerStatus || 'Given'} onChange={handleInputChange} className="form-input col-span-1">
                                    <option value="Given">Given</option>
                                    <option value="Returned">Returned</option>
                                </select>
                            </div>
                            <div className="col-span-2 border-t border-border-color pt-4 mt-2 space-y-3">
                                <label className="flex items-center gap-2 text-sm font-semibold">
                                    <input type="checkbox" checked={formData.warrantyClaim?.isClaim || false} onChange={e => handleClaimChange('isClaim', e.target.checked)} />
                                    Warranty / RMA Claim
                                </label>
                                {formData.warrantyClaim?.isClaim && (
                                    <>
                                        <select
                                            value={formData.warrantyClaim?.warrantyLogId || ''}
                                            onChange={e => handleClaimChange('warrantyLogId', e.target.value)}
                                            className="form-input col-span-2"
                                        >
                                            <option value="">Link warranty record...</option>
                                            {customerWarrantyLogs.map(w => (
                                                <option key={w.id} value={w.id}>
                                                    {w.productName} — SN: {w.serialNumber} (sold {new Date(w.saleDate).toLocaleDateString()})
                                                </option>
                                            ))}
                                        </select>
                                        <input type="text" placeholder="Company Name" value={formData.warrantyClaim?.companyName || ''} onChange={e => handleClaimChange('companyName', e.target.value)} className="form-input" />
                                        <input type="text" placeholder="Ticket Number" value={formData.warrantyClaim?.ticketNumber || ''} onChange={e => handleClaimChange('ticketNumber', e.target.value)} className="form-input" />
                                        <input type="date" placeholder="Sent Date" value={formData.warrantyClaim?.sentDate?.split('T')[0] || ''} onChange={e => handleClaimChange('sentDate', e.target.value ? new Date(e.target.value).toISOString() : '')} className="form-input" />
                                        <textarea placeholder="Company Remarks" value={formData.warrantyClaim?.companyRemarks || ''} onChange={e => handleClaimChange('companyRemarks', e.target.value)} className="form-input col-span-2" rows={2} />
                                    </>
                                )}
                            </div>
                        </div>
                    ) : (
                         <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                            {renderField("Customer", `${formData.customerName} (${formData.customerPhone})`)}
                            {renderField("Status", formData.status)}
                            {renderField("Priority", formData.priority || 'Medium')}
                            {renderField("Vehicle", formData.vehicleDetails)}
                            {renderField("Received Date", new Date(formData.receivedDate).toLocaleString())}
                            {renderField("Assigned To", formData.assignedTo)}
                             {renderField("Est. Completion", formData.estimatedCompletionDate ? new Date(formData.estimatedCompletionDate).toLocaleDateString() : 'N/A')}
                            <div className="col-span-2">{renderField("Issue", formData.issueDescription)}</div>
                            {formData.chargeAmount && renderField("Charge Amount", `${defaultFirm?.financials.currencySymbol || '₹'}${formData.chargeAmount}`)}
                            {formData.loanerItemDetails && (
                                <div className="col-span-2 p-2 bg-blue-50 dark:bg-blue-900/20 rounded border border-blue-100 dark:border-blue-800">
                                    <p className="text-xs font-semibold text-blue-800 dark:text-blue-300 uppercase">Standby Battery</p>
                                    <div className="flex justify-between items-center">
                                        <p className="text-text-primary text-sm">{formData.loanerItemDetails}</p>
                                        <span className={`text-xs font-bold px-2 py-0.5 rounded ${formData.loanerStatus === 'Returned' ? 'bg-green-200 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                            {formData.loanerStatus || 'Given'}
                                        </span>
                                    </div>
                                </div>
                            )}
                            {formData.warrantyClaim?.isClaim && (
                                <div className="col-span-2 p-3 bg-purple-50 dark:bg-purple-900/20 rounded border border-purple-200 dark:border-purple-800 space-y-2">
                                    <p className="text-xs font-semibold text-purple-800 dark:text-purple-300 uppercase">Warranty Claim</p>
                                    {renderField("Company", formData.warrantyClaim.companyName)}
                                    {renderField("Ticket", formData.warrantyClaim.ticketNumber)}
                                    {linkedWarranty && (
                                        <p className="text-sm">Linked: <strong>{linkedWarranty.productName}</strong> (SN: {linkedWarranty.serialNumber})</p>
                                    )}
                                    {formData.warrantyClaim.companyRemarks && renderField("Remarks", formData.warrantyClaim.companyRemarks)}
                                    {formData.warrantyClaim.claimDocumentGeneratedAt && (
                                        <p className="text-xs text-text-muted">Claim PDF generated {new Date(formData.warrantyClaim.claimDocumentGeneratedAt).toLocaleString()}</p>
                                    )}
                                </div>
                            )}
                            {formData.notes && <div className="col-span-2">{renderField("Notes", formData.notes)}</div>}
                        </div>
                    )}
                </div>

                <ModalFooter>
                    {formData.warrantyClaim?.isClaim && !isEditing && (
                        <button type="button" onClick={handleGenerateClaimPdf} className="btn-secondary mr-auto">
                            <IconDownload className="h-4 w-4" /> Generate Claim PDF
                        </button>
                    )}
                    <div className="flex gap-3 ml-auto">
                        <button type="button" onClick={onClose} className="btn-secondary">Close</button>
                        {isEditing ? (
                            <button type="button" onClick={handleSave} className="btn-primary">Save Changes</button>
                        ) : (
                            <button type="button" onClick={() => setIsEditing(true)} className="btn-primary">Edit</button>
                        )}
                    </div>
                </ModalFooter>
        </Modal>
    );
};
