



import React, { useState } from 'react';
import { useMasterData } from '../context/MasterDataContext.tsx';
import { Supplier } from '../types.ts';
import { IconPlus, IconTrash, IconTruck } from './icons.tsx';
import { EmptyState } from './EmptyState.tsx';
import { Modal, ModalHeader, ModalFooter } from './Modal.tsx';
import { FormField } from './FormField.tsx';

const SupplierForm: React.FC<{
    supplier?: Supplier | null;
    onSave: (data: Omit<Supplier, 'id'> | Supplier) => void;
    onClose: () => void;
}> = ({ supplier, onSave, onClose }) => {
    const [formData, setFormData] = useState({
        name: supplier?.name || '',
        contactPerson: supplier?.contactPerson || '',
        phone: supplier?.phone || '',
        email: supplier?.email || '',
        gstin: supplier?.gstin || '',
        address: supplier?.address || '',
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave(supplier ? { ...formData, id: supplier.id } : formData);
    };

    return (
        <Modal onClose={onClose} size="md" ariaLabel={supplier ? 'Edit Supplier' : 'Add New Supplier'}>
            <ModalHeader title={supplier ? 'Edit Supplier' : 'Add New Supplier'} onClose={onClose} />
                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    <FormField label="Company Name">
                        <input type="text" placeholder="Company Name" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="form-input" required />
                    </FormField>
                    <FormField label="Contact Person">
                        <input type="text" placeholder="Contact Person" value={formData.contactPerson} onChange={e => setFormData({...formData, contactPerson: e.target.value})} className="form-input" required />
                    </FormField>
                    <div className="grid grid-cols-2 gap-4">
                        <FormField label="Phone">
                            <input type="tel" placeholder="Phone" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} className="form-input" required />
                        </FormField>
                        <FormField label="Email">
                            <input type="email" placeholder="Email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="form-input" />
                        </FormField>
                    </div>
                    <FormField label="GSTIN">
                        <input type="text" placeholder="GSTIN (Optional)" value={formData.gstin} onChange={e => setFormData({...formData, gstin: e.target.value})} className="form-input" />
                    </FormField>
                    <FormField label="Address">
                        <textarea placeholder="Address" value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} className="form-input" rows={3} />
                    </FormField>

                    <ModalFooter>
                        <div className="flex gap-3 ml-auto">
                            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
                            <button type="submit" className="btn-primary">Save Supplier</button>
                        </div>
                    </ModalFooter>
                </form>
        </Modal>
    );
};

export const SuppliersView: React.FC = () => {
    const { suppliers, addSupplier, updateSupplier, deleteSupplier } = useMasterData();
    const [isFormOpen, setFormOpen] = useState(false);
    const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);

    const handleSave = (data: Omit<Supplier, 'id'> | Supplier) => {
        if ('id' in data) {
            updateSupplier(data);
        } else {
            addSupplier(data);
        }
        setFormOpen(false);
        setEditingSupplier(null);
    };

    return (
        <div className="card-section-padded space-y-6">
            <div className="flex justify-between items-center">
                 <h3 className="text-lg font-bold text-text-primary flex items-center gap-2">
                    <IconTruck className="text-brand-red" /> 
                    Supplier Management
                </h3>
                <button onClick={() => { setEditingSupplier(null); setFormOpen(true); }} className="btn-primary">
                    <IconPlus className="h-4 w-4" /> Add Supplier
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {suppliers.length > 0 ? suppliers.map(supplier => (
                    <div key={supplier.id} className="card p-5 hover:shadow-md transition-shadow">
                        <div className="flex justify-between items-start mb-2">
                            <h3 className="text-lg font-bold text-text-primary">{supplier.name}</h3>
                            <div className="flex gap-2">
                                <button onClick={() => { setEditingSupplier(supplier); setFormOpen(true); }} className="btn-link text-sm">Edit</button>
                                <button onClick={() => deleteSupplier(supplier.id)} className="btn-icon text-red-500 hover:text-red-700" aria-label={`Delete ${supplier.name}`}>
                                    <IconTrash className="h-4 w-4" />
                                </button>
                            </div>
                        </div>
                        <p className="text-sm text-text-secondary mb-4">{supplier.contactPerson}</p>
                        <div className="space-y-1 text-sm text-text-muted">
                            <p className="flex items-center gap-2">📞 {supplier.phone}</p>
                            {supplier.email && <p className="flex items-center gap-2">✉️ {supplier.email}</p>}
                            {supplier.gstin && <p className="flex items-center gap-2">🏢 {supplier.gstin}</p>}
                            {supplier.address && <p className="flex items-center gap-2">📍 {supplier.address}</p>}
                        </div>
                    </div>
                )) : (
                    <div className="col-span-full">
                        <EmptyState icon={<IconTruck />} title="No Suppliers Found" message="Manage your distributors and vendors here." action={{ label: "Add Supplier", onClick: () => setFormOpen(true) }} />
                    </div>
                )}
            </div>

            {isFormOpen && <SupplierForm supplier={editingSupplier} onSave={handleSave} onClose={() => setFormOpen(false)} />}
        </div>
    );
};
