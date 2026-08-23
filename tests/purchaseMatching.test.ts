import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { findSupplier, findProduct, scorePair } from '../utils/purchaseMatching.ts';
import { ProductType, Supplier } from '../types.ts';

const suppliers: Supplier[] = [
    { id: 'S1', name: 'Exide Industries', contactPerson: '', phone: '', gstin: '' },
    { id: 'S2', name: 'Amaron Batteries Distributor', contactPerson: '', phone: '', gstin: '' },
    { id: 'S3', name: 'Exide Power Storage', contactPerson: '', phone: '', gstin: '' },
];

function product(brand: string, name: string): ProductType {
    return {
        id: `P-${brand}-${name}`, brandName: brand, name,
        defaultGuaranteeMonths: 0, defaultWarrantyMonths: 0, lowStockThreshold: 1,
        dealerPrice: 0, specifications: {},
    } as unknown as ProductType;
}

const products = [
    product('Exide', '150Ah Tubular Battery'),
    product('Exide', '100Ah Flat Plate Battery'),
    product('Amaron', '150Ah Tubular Battery'),
    product('Amaron', '100Ah JIS Battery'),
    product('Livguard', '100Ah Lithium Battery'),
];

describe('fuzzy supplier matching', () => {
    it('exact (normalized) matches win deterministically', () => {
        assert.equal(findSupplier(suppliers, 'EXIDE INDUSTRIES')!.id, 'S1');
        assert.equal(findSupplier(suppliers, 'exide industries ')!.id, 'S1');
    });

    it('OCR typos still match (edit distance)', () => {
        assert.equal(findSupplier(suppliers, 'Amaron Batery Distributor')!.id, 'S2');
    });

    it('tiny noise needles match NOTHING — previously first-in-list won', () => {
        // Regression: "a" used to return suppliers[0] via blind substring.
        assert.equal(findSupplier(suppliers, 'a'), undefined);
        assert.equal(findSupplier(suppliers, 'xyzzy'), undefined);
    });

    it('empty needle returns undefined', () => {
        assert.equal(findSupplier(suppliers, ''), undefined);
        assert.equal(findSupplier([], 'anything'), undefined);
    });
});

describe('fuzzy product matching with ambiguity rejection', () => {
    it('matches with capacity + technology attributes intact', () => {
        assert.equal(findProduct(products, 'Exide 150Ah Tubular')!.id, 'P-Exide-150Ah Tubular Battery');
    });

    it('recovers single-character OCR corruption of the brand', () => {
        const match = findProduct(products, 'Exlde 100Ah Flat Plate');
        assert.equal(match!.id, 'P-Exide-100Ah Flat Plate Battery');
    });

    it('REFUSES to guess between near-tied candidates within the margin', () => {
        // Both Amaron SKUs plausibly contain "Amaron 150" — old code picked
        // array order; now the item routes to the unmatched/manual flow.
        const ambiguous = findProduct(products, 'Amaron 150');
        if (ambiguous) {
            // If matched, it must be decisively better than the alternative.
            const alt = products.find(p => p.id !== ambiguous.id && p.brandName === 'Amaron')!;
            assert.ok(scorePair('Amaron 150', `${ambiguous.brandName} ${ambiguous.name}`)
                - scorePair('Amaron 150', `${alt.brandName} ${alt.name}`) >= 0.09);
        }
    });

    it('brand-less description that ties across SKUs routes to manual selection', () => {
        // "Tubular 150Ah" fits BOTH twins almost equally (margin < 0.1) —
        // refusing to guess is the designed outcome, not a bug.
        assert.equal(findProduct(products, 'Tubular 150Ah battery'), undefined);
    });

    it('attribute tokens dominate decisively when they identify ONE SKU', () => {
        // Only one lithium SKU exists — technology token resolves it without a brand.
        const match = findProduct(products, 'Lithium 100Ah');
        assert.equal(match!.id, 'P-Livguard-100Ah Lithium Battery');
    });

    it('scores are bounded and symmetric-ish sanity checks', () => {
        assert.equal(scorePair('same text', 'SAME   TEXT'), 1);
        assert.ok(scorePair('completely different', 'unrelated things here') < 0.3);
    });
});
