# Code Citations

## License: AGPL-3.0
https://github.com/shunkakinoki/ex-sentrei-v2/blob/9d5d8c2f5c15713df5cfc65386a8a88832290127/src/components/TabDashboard/TabDashboard.tsx

```
Based on the current codebase, here's where and how to properly add **Professional Fees (PF)** to your clinic management system:

## Current Structure Analysis

Your invoice system currently has:
- **Items array** - Services with unitPrice (consultation, procedures, labs, etc.)
- **Discounts** - PWD, Senior, Membership, etc.
- **Tax** - Applied to subtotal
- No dedicated Professional Fee field

## Recommended Implementation: Add PF as Separate Invoice Field

Professional Fees in Philippine medical billing are typically:
1. **Doctor's consultation fee** (separate from facility/clinic fee)
2. **Professional fee for procedures** (surgeon's fee separate from hospital)
3. **Reading fees** (radiologist/pathologist interpretation)

### Implementation Plan:

**Option 1: Add PF as Model Field** (RECOMMENDED for PH medical billing)

```typescript
// models/Invoice.ts - Add these fields:

export interface IInvoice extends Document {
  // ... existing fields ...
  items: IBillingItem[];
  subtotal?: number;
  
  // ADD THESE:
  professionalFee?: number; // Doctor/physician professional fee
  professionalFeeDoctor?: Types.ObjectId; // Which doctor gets the PF
  professionalFeeType?: 'consultation' | 'procedure' | 'reading';
  
  discounts: Array<{...}>;
  tax?: number;
  total?: number;
  // ...
}
```

**Where to add in the model file:**
```typescript
// Around line 34 in models/Invoice.ts, after items and subtotal
professionalFee: {
  type: Number,
  default: 0,
  min: 0,
},
professionalFeeDoctor: {
  type: Schema.Types.ObjectId,
  ref: 'Doctor',
},
professionalFeeType: {
  type: String,
  enum: ['consultation', 'procedure', 'reading'],
},
```

**In Invoice Form** (components/InvoiceForm.tsx):
Add PF section after Items section (around line 500):

```tsx
{/* Professional Fee Section */}
<div className="bg-gradient-to-br from-purple-50 to-purple-100/50 border border-purple-200 rounded-xl p-5">
  <div className="flex items-center gap-3 mb-4">
    <div className="p-2 bg-purple-500 rounded-lg">
      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0
```


## License: AGPL-3.0
https://github.com/shunkakinoki/ex-sentrei-v2/blob/9d5d8c2f5c15713df5cfc65386a8a88832290127/src/components/TabDashboard/TabDashboard.tsx

```
Based on the current codebase, here's where and how to properly add **Professional Fees (PF)** to your clinic management system:

## Current Structure Analysis

Your invoice system currently has:
- **Items array** - Services with unitPrice (consultation, procedures, labs, etc.)
- **Discounts** - PWD, Senior, Membership, etc.
- **Tax** - Applied to subtotal
- No dedicated Professional Fee field

## Recommended Implementation: Add PF as Separate Invoice Field

Professional Fees in Philippine medical billing are typically:
1. **Doctor's consultation fee** (separate from facility/clinic fee)
2. **Professional fee for procedures** (surgeon's fee separate from hospital)
3. **Reading fees** (radiologist/pathologist interpretation)

### Implementation Plan:

**Option 1: Add PF as Model Field** (RECOMMENDED for PH medical billing)

```typescript
// models/Invoice.ts - Add these fields:

export interface IInvoice extends Document {
  // ... existing fields ...
  items: IBillingItem[];
  subtotal?: number;
  
  // ADD THESE:
  professionalFee?: number; // Doctor/physician professional fee
  professionalFeeDoctor?: Types.ObjectId; // Which doctor gets the PF
  professionalFeeType?: 'consultation' | 'procedure' | 'reading';
  
  discounts: Array<{...}>;
  tax?: number;
  total?: number;
  // ...
}
```

**Where to add in the model file:**
```typescript
// Around line 34 in models/Invoice.ts, after items and subtotal
professionalFee: {
  type: Number,
  default: 0,
  min: 0,
},
professionalFeeDoctor: {
  type: Schema.Types.ObjectId,
  ref: 'Doctor',
},
professionalFeeType: {
  type: String,
  enum: ['consultation', 'procedure', 'reading'],
},
```

**In Invoice Form** (components/InvoiceForm.tsx):
Add PF section after Items section (around line 500):

```tsx
{/* Professional Fee Section */}
<div className="bg-gradient-to-br from-purple-50 to-purple-100/50 border border-purple-200 rounded-xl p-5">
  <div className="flex items-center gap-3 mb-4">
    <div className="p-2 bg-purple-500 rounded-lg">
      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0
```


## License: AGPL-3.0
https://github.com/shunkakinoki/ex-sentrei-v2/blob/9d5d8c2f5c15713df5cfc65386a8a88832290127/src/components/TabDashboard/TabDashboard.tsx

```
Based on the current codebase, here's where and how to properly add **Professional Fees (PF)** to your clinic management system:

## Current Structure Analysis

Your invoice system currently has:
- **Items array** - Services with unitPrice (consultation, procedures, labs, etc.)
- **Discounts** - PWD, Senior, Membership, etc.
- **Tax** - Applied to subtotal
- No dedicated Professional Fee field

## Recommended Implementation: Add PF as Separate Invoice Field

Professional Fees in Philippine medical billing are typically:
1. **Doctor's consultation fee** (separate from facility/clinic fee)
2. **Professional fee for procedures** (surgeon's fee separate from hospital)
3. **Reading fees** (radiologist/pathologist interpretation)

### Implementation Plan:

**Option 1: Add PF as Model Field** (RECOMMENDED for PH medical billing)

```typescript
// models/Invoice.ts - Add these fields:

export interface IInvoice extends Document {
  // ... existing fields ...
  items: IBillingItem[];
  subtotal?: number;
  
  // ADD THESE:
  professionalFee?: number; // Doctor/physician professional fee
  professionalFeeDoctor?: Types.ObjectId; // Which doctor gets the PF
  professionalFeeType?: 'consultation' | 'procedure' | 'reading';
  
  discounts: Array<{...}>;
  tax?: number;
  total?: number;
  // ...
}
```

**Where to add in the model file:**
```typescript
// Around line 34 in models/Invoice.ts, after items and subtotal
professionalFee: {
  type: Number,
  default: 0,
  min: 0,
},
professionalFeeDoctor: {
  type: Schema.Types.ObjectId,
  ref: 'Doctor',
},
professionalFeeType: {
  type: String,
  enum: ['consultation', 'procedure', 'reading'],
},
```

**In Invoice Form** (components/InvoiceForm.tsx):
Add PF section after Items section (around line 500):

```tsx
{/* Professional Fee Section */}
<div className="bg-gradient-to-br from-purple-50 to-purple-100/50 border border-purple-200 rounded-xl p-5">
  <div className="flex items-center gap-3 mb-4">
    <div className="p-2 bg-purple-500 rounded-lg">
      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0
```


## License: MIT
https://github.com/dreamyguy/gitinsight/blob/e195b7035fac141eb18b27fd8455f634cb71ef25/frontend/src/components/primitives/Icon/DocumentText.js

```
Based on the current codebase, here's where and how to properly add **Professional Fees (PF)** to your clinic management system:

## Current Structure Analysis

Your invoice system currently has:
- **Items array** - Services with unitPrice (consultation, procedures, labs, etc.)
- **Discounts** - PWD, Senior, Membership, etc.
- **Tax** - Applied to subtotal
- No dedicated Professional Fee field

## Recommended Implementation: Add PF as Separate Invoice Field

Professional Fees in Philippine medical billing are typically:
1. **Doctor's consultation fee** (separate from facility/clinic fee)
2. **Professional fee for procedures** (surgeon's fee separate from hospital)
3. **Reading fees** (radiologist/pathologist interpretation)

### Implementation Plan:

**Option 1: Add PF as Model Field** (RECOMMENDED for PH medical billing)

```typescript
// models/Invoice.ts - Add these fields:

export interface IInvoice extends Document {
  // ... existing fields ...
  items: IBillingItem[];
  subtotal?: number;
  
  // ADD THESE:
  professionalFee?: number; // Doctor/physician professional fee
  professionalFeeDoctor?: Types.ObjectId; // Which doctor gets the PF
  professionalFeeType?: 'consultation' | 'procedure' | 'reading';
  
  discounts: Array<{...}>;
  tax?: number;
  total?: number;
  // ...
}
```

**Where to add in the model file:**
```typescript
// Around line 34 in models/Invoice.ts, after items and subtotal
professionalFee: {
  type: Number,
  default: 0,
  min: 0,
},
professionalFeeDoctor: {
  type: Schema.Types.ObjectId,
  ref: 'Doctor',
},
professionalFeeType: {
  type: String,
  enum: ['consultation', 'procedure', 'reading'],
},
```

**In Invoice Form** (components/InvoiceForm.tsx):
Add PF section after Items section (around line 500):

```tsx
{/* Professional Fee Section */}
<div className="bg-gradient-to-br from-purple-50 to-purple-100/50 border border-purple-200 rounded-xl p-5">
  <div className="flex items-center gap-3 mb-4">
    <div className="p-2 bg-purple-500 rounded-lg">
      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    
```


## License: AGPL-3.0
https://github.com/shunkakinoki/ex-sentrei-v2/blob/9d5d8c2f5c15713df5cfc65386a8a88832290127/src/components/TabDashboard/TabDashboard.tsx

```
Based on the current codebase, here's where and how to properly add **Professional Fees (PF)** to your clinic management system:

## Current Structure Analysis

Your invoice system currently has:
- **Items array** - Services with unitPrice (consultation, procedures, labs, etc.)
- **Discounts** - PWD, Senior, Membership, etc.
- **Tax** - Applied to subtotal
- No dedicated Professional Fee field

## Recommended Implementation: Add PF as Separate Invoice Field

Professional Fees in Philippine medical billing are typically:
1. **Doctor's consultation fee** (separate from facility/clinic fee)
2. **Professional fee for procedures** (surgeon's fee separate from hospital)
3. **Reading fees** (radiologist/pathologist interpretation)

### Implementation Plan:

**Option 1: Add PF as Model Field** (RECOMMENDED for PH medical billing)

```typescript
// models/Invoice.ts - Add these fields:

export interface IInvoice extends Document {
  // ... existing fields ...
  items: IBillingItem[];
  subtotal?: number;
  
  // ADD THESE:
  professionalFee?: number; // Doctor/physician professional fee
  professionalFeeDoctor?: Types.ObjectId; // Which doctor gets the PF
  professionalFeeType?: 'consultation' | 'procedure' | 'reading';
  
  discounts: Array<{...}>;
  tax?: number;
  total?: number;
  // ...
}
```

**Where to add in the model file:**
```typescript
// Around line 34 in models/Invoice.ts, after items and subtotal
professionalFee: {
  type: Number,
  default: 0,
  min: 0,
},
professionalFeeDoctor: {
  type: Schema.Types.ObjectId,
  ref: 'Doctor',
},
professionalFeeType: {
  type: String,
  enum: ['consultation', 'procedure', 'reading'],
},
```

**In Invoice Form** (components/InvoiceForm.tsx):
Add PF section after Items section (around line 500):

```tsx
{/* Professional Fee Section */}
<div className="bg-gradient-to-br from-purple-50 to-purple-100/50 border border-purple-200 rounded-xl p-5">
  <div className="flex items-center gap-3 mb-4">
    <div className="p-2 bg-purple-500 rounded-lg">
      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0
```


## License: MIT
https://github.com/dreamyguy/gitinsight/blob/e195b7035fac141eb18b27fd8455f634cb71ef25/frontend/src/components/primitives/Icon/DocumentText.js

```
Based on the current codebase, here's where and how to properly add **Professional Fees (PF)** to your clinic management system:

## Current Structure Analysis

Your invoice system currently has:
- **Items array** - Services with unitPrice (consultation, procedures, labs, etc.)
- **Discounts** - PWD, Senior, Membership, etc.
- **Tax** - Applied to subtotal
- No dedicated Professional Fee field

## Recommended Implementation: Add PF as Separate Invoice Field

Professional Fees in Philippine medical billing are typically:
1. **Doctor's consultation fee** (separate from facility/clinic fee)
2. **Professional fee for procedures** (surgeon's fee separate from hospital)
3. **Reading fees** (radiologist/pathologist interpretation)

### Implementation Plan:

**Option 1: Add PF as Model Field** (RECOMMENDED for PH medical billing)

```typescript
// models/Invoice.ts - Add these fields:

export interface IInvoice extends Document {
  // ... existing fields ...
  items: IBillingItem[];
  subtotal?: number;
  
  // ADD THESE:
  professionalFee?: number; // Doctor/physician professional fee
  professionalFeeDoctor?: Types.ObjectId; // Which doctor gets the PF
  professionalFeeType?: 'consultation' | 'procedure' | 'reading';
  
  discounts: Array<{...}>;
  tax?: number;
  total?: number;
  // ...
}
```

**Where to add in the model file:**
```typescript
// Around line 34 in models/Invoice.ts, after items and subtotal
professionalFee: {
  type: Number,
  default: 0,
  min: 0,
},
professionalFeeDoctor: {
  type: Schema.Types.ObjectId,
  ref: 'Doctor',
},
professionalFeeType: {
  type: String,
  enum: ['consultation', 'procedure', 'reading'],
},
```

**In Invoice Form** (components/InvoiceForm.tsx):
Add PF section after Items section (around line 500):

```tsx
{/* Professional Fee Section */}
<div className="bg-gradient-to-br from-purple-50 to-purple-100/50 border border-purple-200 rounded-xl p-5">
  <div className="flex items-center gap-3 mb-4">
    <div className="p-2 bg-purple-500 rounded-lg">
      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    
```


## License: unknown
https://github.com/foundersandcoders/coursebook/blob/3e3bc52798f56ec39b46ae836306475809f9d6c9/index.11ty.js

```
Based on the current codebase, here's where and how to properly add **Professional Fees (PF)** to your clinic management system:

## Current Structure Analysis

Your invoice system currently has:
- **Items array** - Services with unitPrice (consultation, procedures, labs, etc.)
- **Discounts** - PWD, Senior, Membership, etc.
- **Tax** - Applied to subtotal
- No dedicated Professional Fee field

## Recommended Implementation: Add PF as Separate Invoice Field

Professional Fees in Philippine medical billing are typically:
1. **Doctor's consultation fee** (separate from facility/clinic fee)
2. **Professional fee for procedures** (surgeon's fee separate from hospital)
3. **Reading fees** (radiologist/pathologist interpretation)

### Implementation Plan:

**Option 1: Add PF as Model Field** (RECOMMENDED for PH medical billing)

```typescript
// models/Invoice.ts - Add these fields:

export interface IInvoice extends Document {
  // ... existing fields ...
  items: IBillingItem[];
  subtotal?: number;
  
  // ADD THESE:
  professionalFee?: number; // Doctor/physician professional fee
  professionalFeeDoctor?: Types.ObjectId; // Which doctor gets the PF
  professionalFeeType?: 'consultation' | 'procedure' | 'reading';
  
  discounts: Array<{...}>;
  tax?: number;
  total?: number;
  // ...
}
```

**Where to add in the model file:**
```typescript
// Around line 34 in models/Invoice.ts, after items and subtotal
professionalFee: {
  type: Number,
  default: 0,
  min: 0,
},
professionalFeeDoctor: {
  type: Schema.Types.ObjectId,
  ref: 'Doctor',
},
professionalFeeType: {
  type: String,
  enum: ['consultation', 'procedure', 'reading'],
},
```

**In Invoice Form** (components/InvoiceForm.tsx):
Add PF section after Items section (around line 500):

```tsx
{/* Professional Fee Section */}
<div className="bg-gradient-to-br from-purple-50 to-purple-100/50 border border-purple-200 rounded-xl p-5">
  <div className="flex items-center gap-3 mb-4">
    <div className="p-2 bg-purple-500 rounded-lg">
      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    </div>
    <h3 className="text-lg font
```


## License: AGPL-3.0
https://github.com/shunkakinoki/ex-sentrei-v2/blob/9d5d8c2f5c15713df5cfc65386a8a88832290127/src/components/TabDashboard/TabDashboard.tsx

```
Based on the current codebase, here's where and how to properly add **Professional Fees (PF)** to your clinic management system:

## Current Structure Analysis

Your invoice system currently has:
- **Items array** - Services with unitPrice (consultation, procedures, labs, etc.)
- **Discounts** - PWD, Senior, Membership, etc.
- **Tax** - Applied to subtotal
- No dedicated Professional Fee field

## Recommended Implementation: Add PF as Separate Invoice Field

Professional Fees in Philippine medical billing are typically:
1. **Doctor's consultation fee** (separate from facility/clinic fee)
2. **Professional fee for procedures** (surgeon's fee separate from hospital)
3. **Reading fees** (radiologist/pathologist interpretation)

### Implementation Plan:

**Option 1: Add PF as Model Field** (RECOMMENDED for PH medical billing)

```typescript
// models/Invoice.ts - Add these fields:

export interface IInvoice extends Document {
  // ... existing fields ...
  items: IBillingItem[];
  subtotal?: number;
  
  // ADD THESE:
  professionalFee?: number; // Doctor/physician professional fee
  professionalFeeDoctor?: Types.ObjectId; // Which doctor gets the PF
  professionalFeeType?: 'consultation' | 'procedure' | 'reading';
  
  discounts: Array<{...}>;
  tax?: number;
  total?: number;
  // ...
}
```

**Where to add in the model file:**
```typescript
// Around line 34 in models/Invoice.ts, after items and subtotal
professionalFee: {
  type: Number,
  default: 0,
  min: 0,
},
professionalFeeDoctor: {
  type: Schema.Types.ObjectId,
  ref: 'Doctor',
},
professionalFeeType: {
  type: String,
  enum: ['consultation', 'procedure', 'reading'],
},
```

**In Invoice Form** (components/InvoiceForm.tsx):
Add PF section after Items section (around line 500):

```tsx
{/* Professional Fee Section */}
<div className="bg-gradient-to-br from-purple-50 to-purple-100/50 border border-purple-200 rounded-xl p-5">
  <div className="flex items-center gap-3 mb-4">
    <div className="p-2 bg-purple-500 rounded-lg">
      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0
```


## License: MIT
https://github.com/dreamyguy/gitinsight/blob/e195b7035fac141eb18b27fd8455f634cb71ef25/frontend/src/components/primitives/Icon/DocumentText.js

```
Based on the current codebase, here's where and how to properly add **Professional Fees (PF)** to your clinic management system:

## Current Structure Analysis

Your invoice system currently has:
- **Items array** - Services with unitPrice (consultation, procedures, labs, etc.)
- **Discounts** - PWD, Senior, Membership, etc.
- **Tax** - Applied to subtotal
- No dedicated Professional Fee field

## Recommended Implementation: Add PF as Separate Invoice Field

Professional Fees in Philippine medical billing are typically:
1. **Doctor's consultation fee** (separate from facility/clinic fee)
2. **Professional fee for procedures** (surgeon's fee separate from hospital)
3. **Reading fees** (radiologist/pathologist interpretation)

### Implementation Plan:

**Option 1: Add PF as Model Field** (RECOMMENDED for PH medical billing)

```typescript
// models/Invoice.ts - Add these fields:

export interface IInvoice extends Document {
  // ... existing fields ...
  items: IBillingItem[];
  subtotal?: number;
  
  // ADD THESE:
  professionalFee?: number; // Doctor/physician professional fee
  professionalFeeDoctor?: Types.ObjectId; // Which doctor gets the PF
  professionalFeeType?: 'consultation' | 'procedure' | 'reading';
  
  discounts: Array<{...}>;
  tax?: number;
  total?: number;
  // ...
}
```

**Where to add in the model file:**
```typescript
// Around line 34 in models/Invoice.ts, after items and subtotal
professionalFee: {
  type: Number,
  default: 0,
  min: 0,
},
professionalFeeDoctor: {
  type: Schema.Types.ObjectId,
  ref: 'Doctor',
},
professionalFeeType: {
  type: String,
  enum: ['consultation', 'procedure', 'reading'],
},
```

**In Invoice Form** (components/InvoiceForm.tsx):
Add PF section after Items section (around line 500):

```tsx
{/* Professional Fee Section */}
<div className="bg-gradient-to-br from-purple-50 to-purple-100/50 border border-purple-200 rounded-xl p-5">
  <div className="flex items-center gap-3 mb-4">
    <div className="p-2 bg-purple-500 rounded-lg">
      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    
```


## License: unknown
https://github.com/foundersandcoders/coursebook/blob/3e3bc52798f56ec39b46ae836306475809f9d6c9/index.11ty.js

```
Based on the current codebase, here's where and how to properly add **Professional Fees (PF)** to your clinic management system:

## Current Structure Analysis

Your invoice system currently has:
- **Items array** - Services with unitPrice (consultation, procedures, labs, etc.)
- **Discounts** - PWD, Senior, Membership, etc.
- **Tax** - Applied to subtotal
- No dedicated Professional Fee field

## Recommended Implementation: Add PF as Separate Invoice Field

Professional Fees in Philippine medical billing are typically:
1. **Doctor's consultation fee** (separate from facility/clinic fee)
2. **Professional fee for procedures** (surgeon's fee separate from hospital)
3. **Reading fees** (radiologist/pathologist interpretation)

### Implementation Plan:

**Option 1: Add PF as Model Field** (RECOMMENDED for PH medical billing)

```typescript
// models/Invoice.ts - Add these fields:

export interface IInvoice extends Document {
  // ... existing fields ...
  items: IBillingItem[];
  subtotal?: number;
  
  // ADD THESE:
  professionalFee?: number; // Doctor/physician professional fee
  professionalFeeDoctor?: Types.ObjectId; // Which doctor gets the PF
  professionalFeeType?: 'consultation' | 'procedure' | 'reading';
  
  discounts: Array<{...}>;
  tax?: number;
  total?: number;
  // ...
}
```

**Where to add in the model file:**
```typescript
// Around line 34 in models/Invoice.ts, after items and subtotal
professionalFee: {
  type: Number,
  default: 0,
  min: 0,
},
professionalFeeDoctor: {
  type: Schema.Types.ObjectId,
  ref: 'Doctor',
},
professionalFeeType: {
  type: String,
  enum: ['consultation', 'procedure', 'reading'],
},
```

**In Invoice Form** (components/InvoiceForm.tsx):
Add PF section after Items section (around line 500):

```tsx
{/* Professional Fee Section */}
<div className="bg-gradient-to-br from-purple-50 to-purple-100/50 border border-purple-200 rounded-xl p-5">
  <div className="flex items-center gap-3 mb-4">
    <div className="p-2 bg-purple-500 rounded-lg">
      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    </div>
    <h3 className="text-lg font
```


## License: unknown
https://github.com/2-fly-4-ai/t3-builds-monorepo-nx/blob/036c626e5cbe9dd8e5726fc67686c9c0e898d8f9/libs/shared/ui/src/tools/aithemegen.tsx

```
Based on the current codebase, here's where and how to properly add **Professional Fees (PF)** to your clinic management system:

## Current Structure Analysis

Your invoice system currently has:
- **Items array** - Services with unitPrice (consultation, procedures, labs, etc.)
- **Discounts** - PWD, Senior, Membership, etc.
- **Tax** - Applied to subtotal
- No dedicated Professional Fee field

## Recommended Implementation: Add PF as Separate Invoice Field

Professional Fees in Philippine medical billing are typically:
1. **Doctor's consultation fee** (separate from facility/clinic fee)
2. **Professional fee for procedures** (surgeon's fee separate from hospital)
3. **Reading fees** (radiologist/pathologist interpretation)

### Implementation Plan:

**Option 1: Add PF as Model Field** (RECOMMENDED for PH medical billing)

```typescript
// models/Invoice.ts - Add these fields:

export interface IInvoice extends Document {
  // ... existing fields ...
  items: IBillingItem[];
  subtotal?: number;
  
  // ADD THESE:
  professionalFee?: number; // Doctor/physician professional fee
  professionalFeeDoctor?: Types.ObjectId; // Which doctor gets the PF
  professionalFeeType?: 'consultation' | 'procedure' | 'reading';
  
  discounts: Array<{...}>;
  tax?: number;
  total?: number;
  // ...
}
```

**Where to add in the model file:**
```typescript
// Around line 34 in models/Invoice.ts, after items and subtotal
professionalFee: {
  type: Number,
  default: 0,
  min: 0,
},
professionalFeeDoctor: {
  type: Schema.Types.ObjectId,
  ref: 'Doctor',
},
professionalFeeType: {
  type: String,
  enum: ['consultation', 'procedure', 'reading'],
},
```

**In Invoice Form** (components/InvoiceForm.tsx):
Add PF section after Items section (around line 500):

```tsx
{/* Professional Fee Section */}
<div className="bg-gradient-to-br from-purple-50 to-purple-100/50 border border-purple-200 rounded-xl p-5">
  <div className="flex items-center gap-3 mb-4">
    <div className="p-2 bg-purple-500 rounded-lg">
      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    </div>
    <h3 className="text-lg font
```


## License: AGPL-3.0
https://github.com/shunkakinoki/ex-sentrei-v2/blob/9d5d8c2f5c15713df5cfc65386a8a88832290127/src/components/TabDashboard/TabDashboard.tsx

```
Based on the current codebase, here's where and how to properly add **Professional Fees (PF)** to your clinic management system:

## Current Structure Analysis

Your invoice system currently has:
- **Items array** - Services with unitPrice (consultation, procedures, labs, etc.)
- **Discounts** - PWD, Senior, Membership, etc.
- **Tax** - Applied to subtotal
- No dedicated Professional Fee field

## Recommended Implementation: Add PF as Separate Invoice Field

Professional Fees in Philippine medical billing are typically:
1. **Doctor's consultation fee** (separate from facility/clinic fee)
2. **Professional fee for procedures** (surgeon's fee separate from hospital)
3. **Reading fees** (radiologist/pathologist interpretation)

### Implementation Plan:

**Option 1: Add PF as Model Field** (RECOMMENDED for PH medical billing)

```typescript
// models/Invoice.ts - Add these fields:

export interface IInvoice extends Document {
  // ... existing fields ...
  items: IBillingItem[];
  subtotal?: number;
  
  // ADD THESE:
  professionalFee?: number; // Doctor/physician professional fee
  professionalFeeDoctor?: Types.ObjectId; // Which doctor gets the PF
  professionalFeeType?: 'consultation' | 'procedure' | 'reading';
  
  discounts: Array<{...}>;
  tax?: number;
  total?: number;
  // ...
}
```

**Where to add in the model file:**
```typescript
// Around line 34 in models/Invoice.ts, after items and subtotal
professionalFee: {
  type: Number,
  default: 0,
  min: 0,
},
professionalFeeDoctor: {
  type: Schema.Types.ObjectId,
  ref: 'Doctor',
},
professionalFeeType: {
  type: String,
  enum: ['consultation', 'procedure', 'reading'],
},
```

**In Invoice Form** (components/InvoiceForm.tsx):
Add PF section after Items section (around line 500):

```tsx
{/* Professional Fee Section */}
<div className="bg-gradient-to-br from-purple-50 to-purple-100/50 border border-purple-200 rounded-xl p-5">
  <div className="flex items-center gap-3 mb-4">
    <div className="p-2 bg-purple-500 rounded-lg">
      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0
```


## License: MIT
https://github.com/dreamyguy/gitinsight/blob/e195b7035fac141eb18b27fd8455f634cb71ef25/frontend/src/components/primitives/Icon/DocumentText.js

```
Based on the current codebase, here's where and how to properly add **Professional Fees (PF)** to your clinic management system:

## Current Structure Analysis

Your invoice system currently has:
- **Items array** - Services with unitPrice (consultation, procedures, labs, etc.)
- **Discounts** - PWD, Senior, Membership, etc.
- **Tax** - Applied to subtotal
- No dedicated Professional Fee field

## Recommended Implementation: Add PF as Separate Invoice Field

Professional Fees in Philippine medical billing are typically:
1. **Doctor's consultation fee** (separate from facility/clinic fee)
2. **Professional fee for procedures** (surgeon's fee separate from hospital)
3. **Reading fees** (radiologist/pathologist interpretation)

### Implementation Plan:

**Option 1: Add PF as Model Field** (RECOMMENDED for PH medical billing)

```typescript
// models/Invoice.ts - Add these fields:

export interface IInvoice extends Document {
  // ... existing fields ...
  items: IBillingItem[];
  subtotal?: number;
  
  // ADD THESE:
  professionalFee?: number; // Doctor/physician professional fee
  professionalFeeDoctor?: Types.ObjectId; // Which doctor gets the PF
  professionalFeeType?: 'consultation' | 'procedure' | 'reading';
  
  discounts: Array<{...}>;
  tax?: number;
  total?: number;
  // ...
}
```

**Where to add in the model file:**
```typescript
// Around line 34 in models/Invoice.ts, after items and subtotal
professionalFee: {
  type: Number,
  default: 0,
  min: 0,
},
professionalFeeDoctor: {
  type: Schema.Types.ObjectId,
  ref: 'Doctor',
},
professionalFeeType: {
  type: String,
  enum: ['consultation', 'procedure', 'reading'],
},
```

**In Invoice Form** (components/InvoiceForm.tsx):
Add PF section after Items section (around line 500):

```tsx
{/* Professional Fee Section */}
<div className="bg-gradient-to-br from-purple-50 to-purple-100/50 border border-purple-200 rounded-xl p-5">
  <div className="flex items-center gap-3 mb-4">
    <div className="p-2 bg-purple-500 rounded-lg">
      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    
```


## License: unknown
https://github.com/foundersandcoders/coursebook/blob/3e3bc52798f56ec39b46ae836306475809f9d6c9/index.11ty.js

```
Based on the current codebase, here's where and how to properly add **Professional Fees (PF)** to your clinic management system:

## Current Structure Analysis

Your invoice system currently has:
- **Items array** - Services with unitPrice (consultation, procedures, labs, etc.)
- **Discounts** - PWD, Senior, Membership, etc.
- **Tax** - Applied to subtotal
- No dedicated Professional Fee field

## Recommended Implementation: Add PF as Separate Invoice Field

Professional Fees in Philippine medical billing are typically:
1. **Doctor's consultation fee** (separate from facility/clinic fee)
2. **Professional fee for procedures** (surgeon's fee separate from hospital)
3. **Reading fees** (radiologist/pathologist interpretation)

### Implementation Plan:

**Option 1: Add PF as Model Field** (RECOMMENDED for PH medical billing)

```typescript
// models/Invoice.ts - Add these fields:

export interface IInvoice extends Document {
  // ... existing fields ...
  items: IBillingItem[];
  subtotal?: number;
  
  // ADD THESE:
  professionalFee?: number; // Doctor/physician professional fee
  professionalFeeDoctor?: Types.ObjectId; // Which doctor gets the PF
  professionalFeeType?: 'consultation' | 'procedure' | 'reading';
  
  discounts: Array<{...}>;
  tax?: number;
  total?: number;
  // ...
}
```

**Where to add in the model file:**
```typescript
// Around line 34 in models/Invoice.ts, after items and subtotal
professionalFee: {
  type: Number,
  default: 0,
  min: 0,
},
professionalFeeDoctor: {
  type: Schema.Types.ObjectId,
  ref: 'Doctor',
},
professionalFeeType: {
  type: String,
  enum: ['consultation', 'procedure', 'reading'],
},
```

**In Invoice Form** (components/InvoiceForm.tsx):
Add PF section after Items section (around line 500):

```tsx
{/* Professional Fee Section */}
<div className="bg-gradient-to-br from-purple-50 to-purple-100/50 border border-purple-200 rounded-xl p-5">
  <div className="flex items-center gap-3 mb-4">
    <div className="p-2 bg-purple-500 rounded-lg">
      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    </div>
    <h3 className="text-lg font
```


## License: unknown
https://github.com/2-fly-4-ai/t3-builds-monorepo-nx/blob/036c626e5cbe9dd8e5726fc67686c9c0e898d8f9/libs/shared/ui/src/tools/aithemegen.tsx

```
Based on the current codebase, here's where and how to properly add **Professional Fees (PF)** to your clinic management system:

## Current Structure Analysis

Your invoice system currently has:
- **Items array** - Services with unitPrice (consultation, procedures, labs, etc.)
- **Discounts** - PWD, Senior, Membership, etc.
- **Tax** - Applied to subtotal
- No dedicated Professional Fee field

## Recommended Implementation: Add PF as Separate Invoice Field

Professional Fees in Philippine medical billing are typically:
1. **Doctor's consultation fee** (separate from facility/clinic fee)
2. **Professional fee for procedures** (surgeon's fee separate from hospital)
3. **Reading fees** (radiologist/pathologist interpretation)

### Implementation Plan:

**Option 1: Add PF as Model Field** (RECOMMENDED for PH medical billing)

```typescript
// models/Invoice.ts - Add these fields:

export interface IInvoice extends Document {
  // ... existing fields ...
  items: IBillingItem[];
  subtotal?: number;
  
  // ADD THESE:
  professionalFee?: number; // Doctor/physician professional fee
  professionalFeeDoctor?: Types.ObjectId; // Which doctor gets the PF
  professionalFeeType?: 'consultation' | 'procedure' | 'reading';
  
  discounts: Array<{...}>;
  tax?: number;
  total?: number;
  // ...
}
```

**Where to add in the model file:**
```typescript
// Around line 34 in models/Invoice.ts, after items and subtotal
professionalFee: {
  type: Number,
  default: 0,
  min: 0,
},
professionalFeeDoctor: {
  type: Schema.Types.ObjectId,
  ref: 'Doctor',
},
professionalFeeType: {
  type: String,
  enum: ['consultation', 'procedure', 'reading'],
},
```

**In Invoice Form** (components/InvoiceForm.tsx):
Add PF section after Items section (around line 500):

```tsx
{/* Professional Fee Section */}
<div className="bg-gradient-to-br from-purple-50 to-purple-100/50 border border-purple-200 rounded-xl p-5">
  <div className="flex items-center gap-3 mb-4">
    <div className="p-2 bg-purple-500 rounded-lg">
      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    </div>
    <h3 className="text-lg font
```


## License: AGPL-3.0
https://github.com/shunkakinoki/ex-sentrei-v2/blob/9d5d8c2f5c15713df5cfc65386a8a88832290127/src/components/TabDashboard/TabDashboard.tsx

```
Based on the current codebase, here's where and how to properly add **Professional Fees (PF)** to your clinic management system:

## Current Structure Analysis

Your invoice system currently has:
- **Items array** - Services with unitPrice (consultation, procedures, labs, etc.)
- **Discounts** - PWD, Senior, Membership, etc.
- **Tax** - Applied to subtotal
- No dedicated Professional Fee field

## Recommended Implementation: Add PF as Separate Invoice Field

Professional Fees in Philippine medical billing are typically:
1. **Doctor's consultation fee** (separate from facility/clinic fee)
2. **Professional fee for procedures** (surgeon's fee separate from hospital)
3. **Reading fees** (radiologist/pathologist interpretation)

### Implementation Plan:

**Option 1: Add PF as Model Field** (RECOMMENDED for PH medical billing)

```typescript
// models/Invoice.ts - Add these fields:

export interface IInvoice extends Document {
  // ... existing fields ...
  items: IBillingItem[];
  subtotal?: number;
  
  // ADD THESE:
  professionalFee?: number; // Doctor/physician professional fee
  professionalFeeDoctor?: Types.ObjectId; // Which doctor gets the PF
  professionalFeeType?: 'consultation' | 'procedure' | 'reading';
  
  discounts: Array<{...}>;
  tax?: number;
  total?: number;
  // ...
}
```

**Where to add in the model file:**
```typescript
// Around line 34 in models/Invoice.ts, after items and subtotal
professionalFee: {
  type: Number,
  default: 0,
  min: 0,
},
professionalFeeDoctor: {
  type: Schema.Types.ObjectId,
  ref: 'Doctor',
},
professionalFeeType: {
  type: String,
  enum: ['consultation', 'procedure', 'reading'],
},
```

**In Invoice Form** (components/InvoiceForm.tsx):
Add PF section after Items section (around line 500):

```tsx
{/* Professional Fee Section */}
<div className="bg-gradient-to-br from-purple-50 to-purple-100/50 border border-purple-200 rounded-xl p-5">
  <div className="flex items-center gap-3 mb-4">
    <div className="p-2 bg-purple-500 rounded-lg">
      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0
```


## License: MIT
https://github.com/dreamyguy/gitinsight/blob/e195b7035fac141eb18b27fd8455f634cb71ef25/frontend/src/components/primitives/Icon/DocumentText.js

```
Based on the current codebase, here's where and how to properly add **Professional Fees (PF)** to your clinic management system:

## Current Structure Analysis

Your invoice system currently has:
- **Items array** - Services with unitPrice (consultation, procedures, labs, etc.)
- **Discounts** - PWD, Senior, Membership, etc.
- **Tax** - Applied to subtotal
- No dedicated Professional Fee field

## Recommended Implementation: Add PF as Separate Invoice Field

Professional Fees in Philippine medical billing are typically:
1. **Doctor's consultation fee** (separate from facility/clinic fee)
2. **Professional fee for procedures** (surgeon's fee separate from hospital)
3. **Reading fees** (radiologist/pathologist interpretation)

### Implementation Plan:

**Option 1: Add PF as Model Field** (RECOMMENDED for PH medical billing)

```typescript
// models/Invoice.ts - Add these fields:

export interface IInvoice extends Document {
  // ... existing fields ...
  items: IBillingItem[];
  subtotal?: number;
  
  // ADD THESE:
  professionalFee?: number; // Doctor/physician professional fee
  professionalFeeDoctor?: Types.ObjectId; // Which doctor gets the PF
  professionalFeeType?: 'consultation' | 'procedure' | 'reading';
  
  discounts: Array<{...}>;
  tax?: number;
  total?: number;
  // ...
}
```

**Where to add in the model file:**
```typescript
// Around line 34 in models/Invoice.ts, after items and subtotal
professionalFee: {
  type: Number,
  default: 0,
  min: 0,
},
professionalFeeDoctor: {
  type: Schema.Types.ObjectId,
  ref: 'Doctor',
},
professionalFeeType: {
  type: String,
  enum: ['consultation', 'procedure', 'reading'],
},
```

**In Invoice Form** (components/InvoiceForm.tsx):
Add PF section after Items section (around line 500):

```tsx
{/* Professional Fee Section */}
<div className="bg-gradient-to-br from-purple-50 to-purple-100/50 border border-purple-200 rounded-xl p-5">
  <div className="flex items-center gap-3 mb-4">
    <div className="p-2 bg-purple-500 rounded-lg">
      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    
```


## License: unknown
https://github.com/foundersandcoders/coursebook/blob/3e3bc52798f56ec39b46ae836306475809f9d6c9/index.11ty.js

```
Based on the current codebase, here's where and how to properly add **Professional Fees (PF)** to your clinic management system:

## Current Structure Analysis

Your invoice system currently has:
- **Items array** - Services with unitPrice (consultation, procedures, labs, etc.)
- **Discounts** - PWD, Senior, Membership, etc.
- **Tax** - Applied to subtotal
- No dedicated Professional Fee field

## Recommended Implementation: Add PF as Separate Invoice Field

Professional Fees in Philippine medical billing are typically:
1. **Doctor's consultation fee** (separate from facility/clinic fee)
2. **Professional fee for procedures** (surgeon's fee separate from hospital)
3. **Reading fees** (radiologist/pathologist interpretation)

### Implementation Plan:

**Option 1: Add PF as Model Field** (RECOMMENDED for PH medical billing)

```typescript
// models/Invoice.ts - Add these fields:

export interface IInvoice extends Document {
  // ... existing fields ...
  items: IBillingItem[];
  subtotal?: number;
  
  // ADD THESE:
  professionalFee?: number; // Doctor/physician professional fee
  professionalFeeDoctor?: Types.ObjectId; // Which doctor gets the PF
  professionalFeeType?: 'consultation' | 'procedure' | 'reading';
  
  discounts: Array<{...}>;
  tax?: number;
  total?: number;
  // ...
}
```

**Where to add in the model file:**
```typescript
// Around line 34 in models/Invoice.ts, after items and subtotal
professionalFee: {
  type: Number,
  default: 0,
  min: 0,
},
professionalFeeDoctor: {
  type: Schema.Types.ObjectId,
  ref: 'Doctor',
},
professionalFeeType: {
  type: String,
  enum: ['consultation', 'procedure', 'reading'],
},
```

**In Invoice Form** (components/InvoiceForm.tsx):
Add PF section after Items section (around line 500):

```tsx
{/* Professional Fee Section */}
<div className="bg-gradient-to-br from-purple-50 to-purple-100/50 border border-purple-200 rounded-xl p-5">
  <div className="flex items-center gap-3 mb-4">
    <div className="p-2 bg-purple-500 rounded-lg">
      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    </div>
    <h3 className="text-lg font
```


## License: unknown
https://github.com/2-fly-4-ai/t3-builds-monorepo-nx/blob/036c626e5cbe9dd8e5726fc67686c9c0e898d8f9/libs/shared/ui/src/tools/aithemegen.tsx

```
Based on the current codebase, here's where and how to properly add **Professional Fees (PF)** to your clinic management system:

## Current Structure Analysis

Your invoice system currently has:
- **Items array** - Services with unitPrice (consultation, procedures, labs, etc.)
- **Discounts** - PWD, Senior, Membership, etc.
- **Tax** - Applied to subtotal
- No dedicated Professional Fee field

## Recommended Implementation: Add PF as Separate Invoice Field

Professional Fees in Philippine medical billing are typically:
1. **Doctor's consultation fee** (separate from facility/clinic fee)
2. **Professional fee for procedures** (surgeon's fee separate from hospital)
3. **Reading fees** (radiologist/pathologist interpretation)

### Implementation Plan:

**Option 1: Add PF as Model Field** (RECOMMENDED for PH medical billing)

```typescript
// models/Invoice.ts - Add these fields:

export interface IInvoice extends Document {
  // ... existing fields ...
  items: IBillingItem[];
  subtotal?: number;
  
  // ADD THESE:
  professionalFee?: number; // Doctor/physician professional fee
  professionalFeeDoctor?: Types.ObjectId; // Which doctor gets the PF
  professionalFeeType?: 'consultation' | 'procedure' | 'reading';
  
  discounts: Array<{...}>;
  tax?: number;
  total?: number;
  // ...
}
```

**Where to add in the model file:**
```typescript
// Around line 34 in models/Invoice.ts, after items and subtotal
professionalFee: {
  type: Number,
  default: 0,
  min: 0,
},
professionalFeeDoctor: {
  type: Schema.Types.ObjectId,
  ref: 'Doctor',
},
professionalFeeType: {
  type: String,
  enum: ['consultation', 'procedure', 'reading'],
},
```

**In Invoice Form** (components/InvoiceForm.tsx):
Add PF section after Items section (around line 500):

```tsx
{/* Professional Fee Section */}
<div className="bg-gradient-to-br from-purple-50 to-purple-100/50 border border-purple-200 rounded-xl p-5">
  <div className="flex items-center gap-3 mb-4">
    <div className="p-2 bg-purple-500 rounded-lg">
      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    </div>
    <h3 className="text-lg font
```


## License: AGPL-3.0
https://github.com/shunkakinoki/ex-sentrei-v2/blob/9d5d8c2f5c15713df5cfc65386a8a88832290127/src/components/TabDashboard/TabDashboard.tsx

```
Based on the current codebase, here's where and how to properly add **Professional Fees (PF)** to your clinic management system:

## Current Structure Analysis

Your invoice system currently has:
- **Items array** - Services with unitPrice (consultation, procedures, labs, etc.)
- **Discounts** - PWD, Senior, Membership, etc.
- **Tax** - Applied to subtotal
- No dedicated Professional Fee field

## Recommended Implementation: Add PF as Separate Invoice Field

Professional Fees in Philippine medical billing are typically:
1. **Doctor's consultation fee** (separate from facility/clinic fee)
2. **Professional fee for procedures** (surgeon's fee separate from hospital)
3. **Reading fees** (radiologist/pathologist interpretation)

### Implementation Plan:

**Option 1: Add PF as Model Field** (RECOMMENDED for PH medical billing)

```typescript
// models/Invoice.ts - Add these fields:

export interface IInvoice extends Document {
  // ... existing fields ...
  items: IBillingItem[];
  subtotal?: number;
  
  // ADD THESE:
  professionalFee?: number; // Doctor/physician professional fee
  professionalFeeDoctor?: Types.ObjectId; // Which doctor gets the PF
  professionalFeeType?: 'consultation' | 'procedure' | 'reading';
  
  discounts: Array<{...}>;
  tax?: number;
  total?: number;
  // ...
}
```

**Where to add in the model file:**
```typescript
// Around line 34 in models/Invoice.ts, after items and subtotal
professionalFee: {
  type: Number,
  default: 0,
  min: 0,
},
professionalFeeDoctor: {
  type: Schema.Types.ObjectId,
  ref: 'Doctor',
},
professionalFeeType: {
  type: String,
  enum: ['consultation', 'procedure', 'reading'],
},
```

**In Invoice Form** (components/InvoiceForm.tsx):
Add PF section after Items section (around line 500):

```tsx
{/* Professional Fee Section */}
<div className="bg-gradient-to-br from-purple-50 to-purple-100/50 border border-purple-200 rounded-xl p-5">
  <div className="flex items-center gap-3 mb-4">
    <div className="p-2 bg-purple-500 rounded-lg">
      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0
```


## License: MIT
https://github.com/dreamyguy/gitinsight/blob/e195b7035fac141eb18b27fd8455f634cb71ef25/frontend/src/components/primitives/Icon/DocumentText.js

```
Based on the current codebase, here's where and how to properly add **Professional Fees (PF)** to your clinic management system:

## Current Structure Analysis

Your invoice system currently has:
- **Items array** - Services with unitPrice (consultation, procedures, labs, etc.)
- **Discounts** - PWD, Senior, Membership, etc.
- **Tax** - Applied to subtotal
- No dedicated Professional Fee field

## Recommended Implementation: Add PF as Separate Invoice Field

Professional Fees in Philippine medical billing are typically:
1. **Doctor's consultation fee** (separate from facility/clinic fee)
2. **Professional fee for procedures** (surgeon's fee separate from hospital)
3. **Reading fees** (radiologist/pathologist interpretation)

### Implementation Plan:

**Option 1: Add PF as Model Field** (RECOMMENDED for PH medical billing)

```typescript
// models/Invoice.ts - Add these fields:

export interface IInvoice extends Document {
  // ... existing fields ...
  items: IBillingItem[];
  subtotal?: number;
  
  // ADD THESE:
  professionalFee?: number; // Doctor/physician professional fee
  professionalFeeDoctor?: Types.ObjectId; // Which doctor gets the PF
  professionalFeeType?: 'consultation' | 'procedure' | 'reading';
  
  discounts: Array<{...}>;
  tax?: number;
  total?: number;
  // ...
}
```

**Where to add in the model file:**
```typescript
// Around line 34 in models/Invoice.ts, after items and subtotal
professionalFee: {
  type: Number,
  default: 0,
  min: 0,
},
professionalFeeDoctor: {
  type: Schema.Types.ObjectId,
  ref: 'Doctor',
},
professionalFeeType: {
  type: String,
  enum: ['consultation', 'procedure', 'reading'],
},
```

**In Invoice Form** (components/InvoiceForm.tsx):
Add PF section after Items section (around line 500):

```tsx
{/* Professional Fee Section */}
<div className="bg-gradient-to-br from-purple-50 to-purple-100/50 border border-purple-200 rounded-xl p-5">
  <div className="flex items-center gap-3 mb-4">
    <div className="p-2 bg-purple-500 rounded-lg">
      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    
```


## License: unknown
https://github.com/foundersandcoders/coursebook/blob/3e3bc52798f56ec39b46ae836306475809f9d6c9/index.11ty.js

```
Based on the current codebase, here's where and how to properly add **Professional Fees (PF)** to your clinic management system:

## Current Structure Analysis

Your invoice system currently has:
- **Items array** - Services with unitPrice (consultation, procedures, labs, etc.)
- **Discounts** - PWD, Senior, Membership, etc.
- **Tax** - Applied to subtotal
- No dedicated Professional Fee field

## Recommended Implementation: Add PF as Separate Invoice Field

Professional Fees in Philippine medical billing are typically:
1. **Doctor's consultation fee** (separate from facility/clinic fee)
2. **Professional fee for procedures** (surgeon's fee separate from hospital)
3. **Reading fees** (radiologist/pathologist interpretation)

### Implementation Plan:

**Option 1: Add PF as Model Field** (RECOMMENDED for PH medical billing)

```typescript
// models/Invoice.ts - Add these fields:

export interface IInvoice extends Document {
  // ... existing fields ...
  items: IBillingItem[];
  subtotal?: number;
  
  // ADD THESE:
  professionalFee?: number; // Doctor/physician professional fee
  professionalFeeDoctor?: Types.ObjectId; // Which doctor gets the PF
  professionalFeeType?: 'consultation' | 'procedure' | 'reading';
  
  discounts: Array<{...}>;
  tax?: number;
  total?: number;
  // ...
}
```

**Where to add in the model file:**
```typescript
// Around line 34 in models/Invoice.ts, after items and subtotal
professionalFee: {
  type: Number,
  default: 0,
  min: 0,
},
professionalFeeDoctor: {
  type: Schema.Types.ObjectId,
  ref: 'Doctor',
},
professionalFeeType: {
  type: String,
  enum: ['consultation', 'procedure', 'reading'],
},
```

**In Invoice Form** (components/InvoiceForm.tsx):
Add PF section after Items section (around line 500):

```tsx
{/* Professional Fee Section */}
<div className="bg-gradient-to-br from-purple-50 to-purple-100/50 border border-purple-200 rounded-xl p-5">
  <div className="flex items-center gap-3 mb-4">
    <div className="p-2 bg-purple-500 rounded-lg">
      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    </div>
    <h3 className="text-lg font
```


## License: unknown
https://github.com/2-fly-4-ai/t3-builds-monorepo-nx/blob/036c626e5cbe9dd8e5726fc67686c9c0e898d8f9/libs/shared/ui/src/tools/aithemegen.tsx

```
Based on the current codebase, here's where and how to properly add **Professional Fees (PF)** to your clinic management system:

## Current Structure Analysis

Your invoice system currently has:
- **Items array** - Services with unitPrice (consultation, procedures, labs, etc.)
- **Discounts** - PWD, Senior, Membership, etc.
- **Tax** - Applied to subtotal
- No dedicated Professional Fee field

## Recommended Implementation: Add PF as Separate Invoice Field

Professional Fees in Philippine medical billing are typically:
1. **Doctor's consultation fee** (separate from facility/clinic fee)
2. **Professional fee for procedures** (surgeon's fee separate from hospital)
3. **Reading fees** (radiologist/pathologist interpretation)

### Implementation Plan:

**Option 1: Add PF as Model Field** (RECOMMENDED for PH medical billing)

```typescript
// models/Invoice.ts - Add these fields:

export interface IInvoice extends Document {
  // ... existing fields ...
  items: IBillingItem[];
  subtotal?: number;
  
  // ADD THESE:
  professionalFee?: number; // Doctor/physician professional fee
  professionalFeeDoctor?: Types.ObjectId; // Which doctor gets the PF
  professionalFeeType?: 'consultation' | 'procedure' | 'reading';
  
  discounts: Array<{...}>;
  tax?: number;
  total?: number;
  // ...
}
```

**Where to add in the model file:**
```typescript
// Around line 34 in models/Invoice.ts, after items and subtotal
professionalFee: {
  type: Number,
  default: 0,
  min: 0,
},
professionalFeeDoctor: {
  type: Schema.Types.ObjectId,
  ref: 'Doctor',
},
professionalFeeType: {
  type: String,
  enum: ['consultation', 'procedure', 'reading'],
},
```

**In Invoice Form** (components/InvoiceForm.tsx):
Add PF section after Items section (around line 500):

```tsx
{/* Professional Fee Section */}
<div className="bg-gradient-to-br from-purple-50 to-purple-100/50 border border-purple-200 rounded-xl p-5">
  <div className="flex items-center gap-3 mb-4">
    <div className="p-2 bg-purple-500 rounded-lg">
      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    </div>
    <h3 className="text-lg font
```


## License: AGPL-3.0
https://github.com/shunkakinoki/ex-sentrei-v2/blob/9d5d8c2f5c15713df5cfc65386a8a88832290127/src/components/TabDashboard/TabDashboard.tsx

```
Based on the current codebase, here's where and how to properly add **Professional Fees (PF)** to your clinic management system:

## Current Structure Analysis

Your invoice system currently has:
- **Items array** - Services with unitPrice (consultation, procedures, labs, etc.)
- **Discounts** - PWD, Senior, Membership, etc.
- **Tax** - Applied to subtotal
- No dedicated Professional Fee field

## Recommended Implementation: Add PF as Separate Invoice Field

Professional Fees in Philippine medical billing are typically:
1. **Doctor's consultation fee** (separate from facility/clinic fee)
2. **Professional fee for procedures** (surgeon's fee separate from hospital)
3. **Reading fees** (radiologist/pathologist interpretation)

### Implementation Plan:

**Option 1: Add PF as Model Field** (RECOMMENDED for PH medical billing)

```typescript
// models/Invoice.ts - Add these fields:

export interface IInvoice extends Document {
  // ... existing fields ...
  items: IBillingItem[];
  subtotal?: number;
  
  // ADD THESE:
  professionalFee?: number; // Doctor/physician professional fee
  professionalFeeDoctor?: Types.ObjectId; // Which doctor gets the PF
  professionalFeeType?: 'consultation' | 'procedure' | 'reading';
  
  discounts: Array<{...}>;
  tax?: number;
  total?: number;
  // ...
}
```

**Where to add in the model file:**
```typescript
// Around line 34 in models/Invoice.ts, after items and subtotal
professionalFee: {
  type: Number,
  default: 0,
  min: 0,
},
professionalFeeDoctor: {
  type: Schema.Types.ObjectId,
  ref: 'Doctor',
},
professionalFeeType: {
  type: String,
  enum: ['consultation', 'procedure', 'reading'],
},
```

**In Invoice Form** (components/InvoiceForm.tsx):
Add PF section after Items section (around line 500):

```tsx
{/* Professional Fee Section */}
<div className="bg-gradient-to-br from-purple-50 to-purple-100/50 border border-purple-200 rounded-xl p-5">
  <div className="flex items-center gap-3 mb-4">
    <div className="p-2 bg-purple-500 rounded-lg">
      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0
```


## License: MIT
https://github.com/dreamyguy/gitinsight/blob/e195b7035fac141eb18b27fd8455f634cb71ef25/frontend/src/components/primitives/Icon/DocumentText.js

```
Based on the current codebase, here's where and how to properly add **Professional Fees (PF)** to your clinic management system:

## Current Structure Analysis

Your invoice system currently has:
- **Items array** - Services with unitPrice (consultation, procedures, labs, etc.)
- **Discounts** - PWD, Senior, Membership, etc.
- **Tax** - Applied to subtotal
- No dedicated Professional Fee field

## Recommended Implementation: Add PF as Separate Invoice Field

Professional Fees in Philippine medical billing are typically:
1. **Doctor's consultation fee** (separate from facility/clinic fee)
2. **Professional fee for procedures** (surgeon's fee separate from hospital)
3. **Reading fees** (radiologist/pathologist interpretation)

### Implementation Plan:

**Option 1: Add PF as Model Field** (RECOMMENDED for PH medical billing)

```typescript
// models/Invoice.ts - Add these fields:

export interface IInvoice extends Document {
  // ... existing fields ...
  items: IBillingItem[];
  subtotal?: number;
  
  // ADD THESE:
  professionalFee?: number; // Doctor/physician professional fee
  professionalFeeDoctor?: Types.ObjectId; // Which doctor gets the PF
  professionalFeeType?: 'consultation' | 'procedure' | 'reading';
  
  discounts: Array<{...}>;
  tax?: number;
  total?: number;
  // ...
}
```

**Where to add in the model file:**
```typescript
// Around line 34 in models/Invoice.ts, after items and subtotal
professionalFee: {
  type: Number,
  default: 0,
  min: 0,
},
professionalFeeDoctor: {
  type: Schema.Types.ObjectId,
  ref: 'Doctor',
},
professionalFeeType: {
  type: String,
  enum: ['consultation', 'procedure', 'reading'],
},
```

**In Invoice Form** (components/InvoiceForm.tsx):
Add PF section after Items section (around line 500):

```tsx
{/* Professional Fee Section */}
<div className="bg-gradient-to-br from-purple-50 to-purple-100/50 border border-purple-200 rounded-xl p-5">
  <div className="flex items-center gap-3 mb-4">
    <div className="p-2 bg-purple-500 rounded-lg">
      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    
```


## License: unknown
https://github.com/foundersandcoders/coursebook/blob/3e3bc52798f56ec39b46ae836306475809f9d6c9/index.11ty.js

```
Based on the current codebase, here's where and how to properly add **Professional Fees (PF)** to your clinic management system:

## Current Structure Analysis

Your invoice system currently has:
- **Items array** - Services with unitPrice (consultation, procedures, labs, etc.)
- **Discounts** - PWD, Senior, Membership, etc.
- **Tax** - Applied to subtotal
- No dedicated Professional Fee field

## Recommended Implementation: Add PF as Separate Invoice Field

Professional Fees in Philippine medical billing are typically:
1. **Doctor's consultation fee** (separate from facility/clinic fee)
2. **Professional fee for procedures** (surgeon's fee separate from hospital)
3. **Reading fees** (radiologist/pathologist interpretation)

### Implementation Plan:

**Option 1: Add PF as Model Field** (RECOMMENDED for PH medical billing)

```typescript
// models/Invoice.ts - Add these fields:

export interface IInvoice extends Document {
  // ... existing fields ...
  items: IBillingItem[];
  subtotal?: number;
  
  // ADD THESE:
  professionalFee?: number; // Doctor/physician professional fee
  professionalFeeDoctor?: Types.ObjectId; // Which doctor gets the PF
  professionalFeeType?: 'consultation' | 'procedure' | 'reading';
  
  discounts: Array<{...}>;
  tax?: number;
  total?: number;
  // ...
}
```

**Where to add in the model file:**
```typescript
// Around line 34 in models/Invoice.ts, after items and subtotal
professionalFee: {
  type: Number,
  default: 0,
  min: 0,
},
professionalFeeDoctor: {
  type: Schema.Types.ObjectId,
  ref: 'Doctor',
},
professionalFeeType: {
  type: String,
  enum: ['consultation', 'procedure', 'reading'],
},
```

**In Invoice Form** (components/InvoiceForm.tsx):
Add PF section after Items section (around line 500):

```tsx
{/* Professional Fee Section */}
<div className="bg-gradient-to-br from-purple-50 to-purple-100/50 border border-purple-200 rounded-xl p-5">
  <div className="flex items-center gap-3 mb-4">
    <div className="p-2 bg-purple-500 rounded-lg">
      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    </div>
    <h3 className="text-lg font
```


## License: unknown
https://github.com/2-fly-4-ai/t3-builds-monorepo-nx/blob/036c626e5cbe9dd8e5726fc67686c9c0e898d8f9/libs/shared/ui/src/tools/aithemegen.tsx

```
Based on the current codebase, here's where and how to properly add **Professional Fees (PF)** to your clinic management system:

## Current Structure Analysis

Your invoice system currently has:
- **Items array** - Services with unitPrice (consultation, procedures, labs, etc.)
- **Discounts** - PWD, Senior, Membership, etc.
- **Tax** - Applied to subtotal
- No dedicated Professional Fee field

## Recommended Implementation: Add PF as Separate Invoice Field

Professional Fees in Philippine medical billing are typically:
1. **Doctor's consultation fee** (separate from facility/clinic fee)
2. **Professional fee for procedures** (surgeon's fee separate from hospital)
3. **Reading fees** (radiologist/pathologist interpretation)

### Implementation Plan:

**Option 1: Add PF as Model Field** (RECOMMENDED for PH medical billing)

```typescript
// models/Invoice.ts - Add these fields:

export interface IInvoice extends Document {
  // ... existing fields ...
  items: IBillingItem[];
  subtotal?: number;
  
  // ADD THESE:
  professionalFee?: number; // Doctor/physician professional fee
  professionalFeeDoctor?: Types.ObjectId; // Which doctor gets the PF
  professionalFeeType?: 'consultation' | 'procedure' | 'reading';
  
  discounts: Array<{...}>;
  tax?: number;
  total?: number;
  // ...
}
```

**Where to add in the model file:**
```typescript
// Around line 34 in models/Invoice.ts, after items and subtotal
professionalFee: {
  type: Number,
  default: 0,
  min: 0,
},
professionalFeeDoctor: {
  type: Schema.Types.ObjectId,
  ref: 'Doctor',
},
professionalFeeType: {
  type: String,
  enum: ['consultation', 'procedure', 'reading'],
},
```

**In Invoice Form** (components/InvoiceForm.tsx):
Add PF section after Items section (around line 500):

```tsx
{/* Professional Fee Section */}
<div className="bg-gradient-to-br from-purple-50 to-purple-100/50 border border-purple-200 rounded-xl p-5">
  <div className="flex items-center gap-3 mb-4">
    <div className="p-2 bg-purple-500 rounded-lg">
      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    </div>
    <h3 className="text-lg font
```


## License: AGPL-3.0
https://github.com/shunkakinoki/ex-sentrei-v2/blob/9d5d8c2f5c15713df5cfc65386a8a88832290127/src/components/TabDashboard/TabDashboard.tsx

```
Based on the current codebase, here's where and how to properly add **Professional Fees (PF)** to your clinic management system:

## Current Structure Analysis

Your invoice system currently has:
- **Items array** - Services with unitPrice (consultation, procedures, labs, etc.)
- **Discounts** - PWD, Senior, Membership, etc.
- **Tax** - Applied to subtotal
- No dedicated Professional Fee field

## Recommended Implementation: Add PF as Separate Invoice Field

Professional Fees in Philippine medical billing are typically:
1. **Doctor's consultation fee** (separate from facility/clinic fee)
2. **Professional fee for procedures** (surgeon's fee separate from hospital)
3. **Reading fees** (radiologist/pathologist interpretation)

### Implementation Plan:

**Option 1: Add PF as Model Field** (RECOMMENDED for PH medical billing)

```typescript
// models/Invoice.ts - Add these fields:

export interface IInvoice extends Document {
  // ... existing fields ...
  items: IBillingItem[];
  subtotal?: number;
  
  // ADD THESE:
  professionalFee?: number; // Doctor/physician professional fee
  professionalFeeDoctor?: Types.ObjectId; // Which doctor gets the PF
  professionalFeeType?: 'consultation' | 'procedure' | 'reading';
  
  discounts: Array<{...}>;
  tax?: number;
  total?: number;
  // ...
}
```

**Where to add in the model file:**
```typescript
// Around line 34 in models/Invoice.ts, after items and subtotal
professionalFee: {
  type: Number,
  default: 0,
  min: 0,
},
professionalFeeDoctor: {
  type: Schema.Types.ObjectId,
  ref: 'Doctor',
},
professionalFeeType: {
  type: String,
  enum: ['consultation', 'procedure', 'reading'],
},
```

**In Invoice Form** (components/InvoiceForm.tsx):
Add PF section after Items section (around line 500):

```tsx
{/* Professional Fee Section */}
<div className="bg-gradient-to-br from-purple-50 to-purple-100/50 border border-purple-200 rounded-xl p-5">
  <div className="flex items-center gap-3 mb-4">
    <div className="p-2 bg-purple-500 rounded-lg">
      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 
```


## License: MIT
https://github.com/dreamyguy/gitinsight/blob/e195b7035fac141eb18b27fd8455f634cb71ef25/frontend/src/components/primitives/Icon/DocumentText.js

```
Based on the current codebase, here's where and how to properly add **Professional Fees (PF)** to your clinic management system:

## Current Structure Analysis

Your invoice system currently has:
- **Items array** - Services with unitPrice (consultation, procedures, labs, etc.)
- **Discounts** - PWD, Senior, Membership, etc.
- **Tax** - Applied to subtotal
- No dedicated Professional Fee field

## Recommended Implementation: Add PF as Separate Invoice Field

Professional Fees in Philippine medical billing are typically:
1. **Doctor's consultation fee** (separate from facility/clinic fee)
2. **Professional fee for procedures** (surgeon's fee separate from hospital)
3. **Reading fees** (radiologist/pathologist interpretation)

### Implementation Plan:

**Option 1: Add PF as Model Field** (RECOMMENDED for PH medical billing)

```typescript
// models/Invoice.ts - Add these fields:

export interface IInvoice extends Document {
  // ... existing fields ...
  items: IBillingItem[];
  subtotal?: number;
  
  // ADD THESE:
  professionalFee?: number; // Doctor/physician professional fee
  professionalFeeDoctor?: Types.ObjectId; // Which doctor gets the PF
  professionalFeeType?: 'consultation' | 'procedure' | 'reading';
  
  discounts: Array<{...}>;
  tax?: number;
  total?: number;
  // ...
}
```

**Where to add in the model file:**
```typescript
// Around line 34 in models/Invoice.ts, after items and subtotal
professionalFee: {
  type: Number,
  default: 0,
  min: 0,
},
professionalFeeDoctor: {
  type: Schema.Types.ObjectId,
  ref: 'Doctor',
},
professionalFeeType: {
  type: String,
  enum: ['consultation', 'procedure', 'reading'],
},
```

**In Invoice Form** (components/InvoiceForm.tsx):
Add PF section after Items section (around line 500):

```tsx
{/* Professional Fee Section */}
<div className="bg-gradient-to-br from-purple-50 to-purple-100/50 border border-purple-200 rounded-xl p-5">
  <div className="flex items-center gap-3 mb-4">
    <div className="p-2 bg-purple-500 rounded-lg">
      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    
```


## License: unknown
https://github.com/foundersandcoders/coursebook/blob/3e3bc52798f56ec39b46ae836306475809f9d6c9/index.11ty.js

```
Based on the current codebase, here's where and how to properly add **Professional Fees (PF)** to your clinic management system:

## Current Structure Analysis

Your invoice system currently has:
- **Items array** - Services with unitPrice (consultation, procedures, labs, etc.)
- **Discounts** - PWD, Senior, Membership, etc.
- **Tax** - Applied to subtotal
- No dedicated Professional Fee field

## Recommended Implementation: Add PF as Separate Invoice Field

Professional Fees in Philippine medical billing are typically:
1. **Doctor's consultation fee** (separate from facility/clinic fee)
2. **Professional fee for procedures** (surgeon's fee separate from hospital)
3. **Reading fees** (radiologist/pathologist interpretation)

### Implementation Plan:

**Option 1: Add PF as Model Field** (RECOMMENDED for PH medical billing)

```typescript
// models/Invoice.ts - Add these fields:

export interface IInvoice extends Document {
  // ... existing fields ...
  items: IBillingItem[];
  subtotal?: number;
  
  // ADD THESE:
  professionalFee?: number; // Doctor/physician professional fee
  professionalFeeDoctor?: Types.ObjectId; // Which doctor gets the PF
  professionalFeeType?: 'consultation' | 'procedure' | 'reading';
  
  discounts: Array<{...}>;
  tax?: number;
  total?: number;
  // ...
}
```

**Where to add in the model file:**
```typescript
// Around line 34 in models/Invoice.ts, after items and subtotal
professionalFee: {
  type: Number,
  default: 0,
  min: 0,
},
professionalFeeDoctor: {
  type: Schema.Types.ObjectId,
  ref: 'Doctor',
},
professionalFeeType: {
  type: String,
  enum: ['consultation', 'procedure', 'reading'],
},
```

**In Invoice Form** (components/InvoiceForm.tsx):
Add PF section after Items section (around line 500):

```tsx
{/* Professional Fee Section */}
<div className="bg-gradient-to-br from-purple-50 to-purple-100/50 border border-purple-200 rounded-xl p-5">
  <div className="flex items-center gap-3 mb-4">
    <div className="p-2 bg-purple-500 rounded-lg">
      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    </div>
    <h3 className="text-lg font
```


## License: unknown
https://github.com/2-fly-4-ai/t3-builds-monorepo-nx/blob/036c626e5cbe9dd8e5726fc67686c9c0e898d8f9/libs/shared/ui/src/tools/aithemegen.tsx

```
Based on the current codebase, here's where and how to properly add **Professional Fees (PF)** to your clinic management system:

## Current Structure Analysis

Your invoice system currently has:
- **Items array** - Services with unitPrice (consultation, procedures, labs, etc.)
- **Discounts** - PWD, Senior, Membership, etc.
- **Tax** - Applied to subtotal
- No dedicated Professional Fee field

## Recommended Implementation: Add PF as Separate Invoice Field

Professional Fees in Philippine medical billing are typically:
1. **Doctor's consultation fee** (separate from facility/clinic fee)
2. **Professional fee for procedures** (surgeon's fee separate from hospital)
3. **Reading fees** (radiologist/pathologist interpretation)

### Implementation Plan:

**Option 1: Add PF as Model Field** (RECOMMENDED for PH medical billing)

```typescript
// models/Invoice.ts - Add these fields:

export interface IInvoice extends Document {
  // ... existing fields ...
  items: IBillingItem[];
  subtotal?: number;
  
  // ADD THESE:
  professionalFee?: number; // Doctor/physician professional fee
  professionalFeeDoctor?: Types.ObjectId; // Which doctor gets the PF
  professionalFeeType?: 'consultation' | 'procedure' | 'reading';
  
  discounts: Array<{...}>;
  tax?: number;
  total?: number;
  // ...
}
```

**Where to add in the model file:**
```typescript
// Around line 34 in models/Invoice.ts, after items and subtotal
professionalFee: {
  type: Number,
  default: 0,
  min: 0,
},
professionalFeeDoctor: {
  type: Schema.Types.ObjectId,
  ref: 'Doctor',
},
professionalFeeType: {
  type: String,
  enum: ['consultation', 'procedure', 'reading'],
},
```

**In Invoice Form** (components/InvoiceForm.tsx):
Add PF section after Items section (around line 500):

```tsx
{/* Professional Fee Section */}
<div className="bg-gradient-to-br from-purple-50 to-purple-100/50 border border-purple-200 rounded-xl p-5">
  <div className="flex items-center gap-3 mb-4">
    <div className="p-2 bg-purple-500 rounded-lg">
      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    </div>
    <h3 className="text-lg font
```


## License: AGPL-3.0
https://github.com/shunkakinoki/ex-sentrei-v2/blob/9d5d8c2f5c15713df5cfc65386a8a88832290127/src/components/TabDashboard/TabDashboard.tsx

```
Based on the current codebase, here's where and how to properly add **Professional Fees (PF)** to your clinic management system:

## Current Structure Analysis

Your invoice system currently has:
- **Items array** - Services with unitPrice (consultation, procedures, labs, etc.)
- **Discounts** - PWD, Senior, Membership, etc.
- **Tax** - Applied to subtotal
- No dedicated Professional Fee field

## Recommended Implementation: Add PF as Separate Invoice Field

Professional Fees in Philippine medical billing are typically:
1. **Doctor's consultation fee** (separate from facility/clinic fee)
2. **Professional fee for procedures** (surgeon's fee separate from hospital)
3. **Reading fees** (radiologist/pathologist interpretation)

### Implementation Plan:

**Option 1: Add PF as Model Field** (RECOMMENDED for PH medical billing)

```typescript
// models/Invoice.ts - Add these fields:

export interface IInvoice extends Document {
  // ... existing fields ...
  items: IBillingItem[];
  subtotal?: number;
  
  // ADD THESE:
  professionalFee?: number; // Doctor/physician professional fee
  professionalFeeDoctor?: Types.ObjectId; // Which doctor gets the PF
  professionalFeeType?: 'consultation' | 'procedure' | 'reading';
  
  discounts: Array<{...}>;
  tax?: number;
  total?: number;
  // ...
}
```

**Where to add in the model file:**
```typescript
// Around line 34 in models/Invoice.ts, after items and subtotal
professionalFee: {
  type: Number,
  default: 0,
  min: 0,
},
professionalFeeDoctor: {
  type: Schema.Types.ObjectId,
  ref: 'Doctor',
},
professionalFeeType: {
  type: String,
  enum: ['consultation', 'procedure', 'reading'],
},
```

**In Invoice Form** (components/InvoiceForm.tsx):
Add PF section after Items section (around line 500):

```tsx
{/* Professional Fee Section */}
<div className="bg-gradient-to-br from-purple-50 to-purple-100/50 border border-purple-200 rounded-xl p-5">
  <div className="flex items-center gap-3 mb-4">
    <div className="p-2 bg-purple-500 rounded-lg">
      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 
```


## License: MIT
https://github.com/dreamyguy/gitinsight/blob/e195b7035fac141eb18b27fd8455f634cb71ef25/frontend/src/components/primitives/Icon/DocumentText.js

```
Based on the current codebase, here's where and how to properly add **Professional Fees (PF)** to your clinic management system:

## Current Structure Analysis

Your invoice system currently has:
- **Items array** - Services with unitPrice (consultation, procedures, labs, etc.)
- **Discounts** - PWD, Senior, Membership, etc.
- **Tax** - Applied to subtotal
- No dedicated Professional Fee field

## Recommended Implementation: Add PF as Separate Invoice Field

Professional Fees in Philippine medical billing are typically:
1. **Doctor's consultation fee** (separate from facility/clinic fee)
2. **Professional fee for procedures** (surgeon's fee separate from hospital)
3. **Reading fees** (radiologist/pathologist interpretation)

### Implementation Plan:

**Option 1: Add PF as Model Field** (RECOMMENDED for PH medical billing)

```typescript
// models/Invoice.ts - Add these fields:

export interface IInvoice extends Document {
  // ... existing fields ...
  items: IBillingItem[];
  subtotal?: number;
  
  // ADD THESE:
  professionalFee?: number; // Doctor/physician professional fee
  professionalFeeDoctor?: Types.ObjectId; // Which doctor gets the PF
  professionalFeeType?: 'consultation' | 'procedure' | 'reading';
  
  discounts: Array<{...}>;
  tax?: number;
  total?: number;
  // ...
}
```

**Where to add in the model file:**
```typescript
// Around line 34 in models/Invoice.ts, after items and subtotal
professionalFee: {
  type: Number,
  default: 0,
  min: 0,
},
professionalFeeDoctor: {
  type: Schema.Types.ObjectId,
  ref: 'Doctor',
},
professionalFeeType: {
  type: String,
  enum: ['consultation', 'procedure', 'reading'],
},
```

**In Invoice Form** (components/InvoiceForm.tsx):
Add PF section after Items section (around line 500):

```tsx
{/* Professional Fee Section */}
<div className="bg-gradient-to-br from-purple-50 to-purple-100/50 border border-purple-200 rounded-xl p-5">
  <div className="flex items-center gap-3 mb-4">
    <div className="p-2 bg-purple-500 rounded-lg">
      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    
```


## License: unknown
https://github.com/foundersandcoders/coursebook/blob/3e3bc52798f56ec39b46ae836306475809f9d6c9/index.11ty.js

```
Based on the current codebase, here's where and how to properly add **Professional Fees (PF)** to your clinic management system:

## Current Structure Analysis

Your invoice system currently has:
- **Items array** - Services with unitPrice (consultation, procedures, labs, etc.)
- **Discounts** - PWD, Senior, Membership, etc.
- **Tax** - Applied to subtotal
- No dedicated Professional Fee field

## Recommended Implementation: Add PF as Separate Invoice Field

Professional Fees in Philippine medical billing are typically:
1. **Doctor's consultation fee** (separate from facility/clinic fee)
2. **Professional fee for procedures** (surgeon's fee separate from hospital)
3. **Reading fees** (radiologist/pathologist interpretation)

### Implementation Plan:

**Option 1: Add PF as Model Field** (RECOMMENDED for PH medical billing)

```typescript
// models/Invoice.ts - Add these fields:

export interface IInvoice extends Document {
  // ... existing fields ...
  items: IBillingItem[];
  subtotal?: number;
  
  // ADD THESE:
  professionalFee?: number; // Doctor/physician professional fee
  professionalFeeDoctor?: Types.ObjectId; // Which doctor gets the PF
  professionalFeeType?: 'consultation' | 'procedure' | 'reading';
  
  discounts: Array<{...}>;
  tax?: number;
  total?: number;
  // ...
}
```

**Where to add in the model file:**
```typescript
// Around line 34 in models/Invoice.ts, after items and subtotal
professionalFee: {
  type: Number,
  default: 0,
  min: 0,
},
professionalFeeDoctor: {
  type: Schema.Types.ObjectId,
  ref: 'Doctor',
},
professionalFeeType: {
  type: String,
  enum: ['consultation', 'procedure', 'reading'],
},
```

**In Invoice Form** (components/InvoiceForm.tsx):
Add PF section after Items section (around line 500):

```tsx
{/* Professional Fee Section */}
<div className="bg-gradient-to-br from-purple-50 to-purple-100/50 border border-purple-200 rounded-xl p-5">
  <div className="flex items-center gap-3 mb-4">
    <div className="p-2 bg-purple-500 rounded-lg">
      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    </div>
    <h3 className="text-lg font
```


## License: unknown
https://github.com/2-fly-4-ai/t3-builds-monorepo-nx/blob/036c626e5cbe9dd8e5726fc67686c9c0e898d8f9/libs/shared/ui/src/tools/aithemegen.tsx

```
Based on the current codebase, here's where and how to properly add **Professional Fees (PF)** to your clinic management system:

## Current Structure Analysis

Your invoice system currently has:
- **Items array** - Services with unitPrice (consultation, procedures, labs, etc.)
- **Discounts** - PWD, Senior, Membership, etc.
- **Tax** - Applied to subtotal
- No dedicated Professional Fee field

## Recommended Implementation: Add PF as Separate Invoice Field

Professional Fees in Philippine medical billing are typically:
1. **Doctor's consultation fee** (separate from facility/clinic fee)
2. **Professional fee for procedures** (surgeon's fee separate from hospital)
3. **Reading fees** (radiologist/pathologist interpretation)

### Implementation Plan:

**Option 1: Add PF as Model Field** (RECOMMENDED for PH medical billing)

```typescript
// models/Invoice.ts - Add these fields:

export interface IInvoice extends Document {
  // ... existing fields ...
  items: IBillingItem[];
  subtotal?: number;
  
  // ADD THESE:
  professionalFee?: number; // Doctor/physician professional fee
  professionalFeeDoctor?: Types.ObjectId; // Which doctor gets the PF
  professionalFeeType?: 'consultation' | 'procedure' | 'reading';
  
  discounts: Array<{...}>;
  tax?: number;
  total?: number;
  // ...
}
```

**Where to add in the model file:**
```typescript
// Around line 34 in models/Invoice.ts, after items and subtotal
professionalFee: {
  type: Number,
  default: 0,
  min: 0,
},
professionalFeeDoctor: {
  type: Schema.Types.ObjectId,
  ref: 'Doctor',
},
professionalFeeType: {
  type: String,
  enum: ['consultation', 'procedure', 'reading'],
},
```

**In Invoice Form** (components/InvoiceForm.tsx):
Add PF section after Items section (around line 500):

```tsx
{/* Professional Fee Section */}
<div className="bg-gradient-to-br from-purple-50 to-purple-100/50 border border-purple-200 rounded-xl p-5">
  <div className="flex items-center gap-3 mb-4">
    <div className="p-2 bg-purple-500 rounded-lg">
      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    </div>
    <h3 className="text-lg font
```


## License: AGPL-3.0
https://github.com/shunkakinoki/ex-sentrei-v2/blob/9d5d8c2f5c15713df5cfc65386a8a88832290127/src/components/TabDashboard/TabDashboard.tsx

```
Based on the current codebase, here's where and how to properly add **Professional Fees (PF)** to your clinic management system:

## Current Structure Analysis

Your invoice system currently has:
- **Items array** - Services with unitPrice (consultation, procedures, labs, etc.)
- **Discounts** - PWD, Senior, Membership, etc.
- **Tax** - Applied to subtotal
- No dedicated Professional Fee field

## Recommended Implementation: Add PF as Separate Invoice Field

Professional Fees in Philippine medical billing are typically:
1. **Doctor's consultation fee** (separate from facility/clinic fee)
2. **Professional fee for procedures** (surgeon's fee separate from hospital)
3. **Reading fees** (radiologist/pathologist interpretation)

### Implementation Plan:

**Option 1: Add PF as Model Field** (RECOMMENDED for PH medical billing)

```typescript
// models/Invoice.ts - Add these fields:

export interface IInvoice extends Document {
  // ... existing fields ...
  items: IBillingItem[];
  subtotal?: number;
  
  // ADD THESE:
  professionalFee?: number; // Doctor/physician professional fee
  professionalFeeDoctor?: Types.ObjectId; // Which doctor gets the PF
  professionalFeeType?: 'consultation' | 'procedure' | 'reading';
  
  discounts: Array<{...}>;
  tax?: number;
  total?: number;
  // ...
}
```

**Where to add in the model file:**
```typescript
// Around line 34 in models/Invoice.ts, after items and subtotal
professionalFee: {
  type: Number,
  default: 0,
  min: 0,
},
professionalFeeDoctor: {
  type: Schema.Types.ObjectId,
  ref: 'Doctor',
},
professionalFeeType: {
  type: String,
  enum: ['consultation', 'procedure', 'reading'],
},
```

**In Invoice Form** (components/InvoiceForm.tsx):
Add PF section after Items section (around line 500):

```tsx
{/* Professional Fee Section */}
<div className="bg-gradient-to-br from-purple-50 to-purple-100/50 border border-purple-200 rounded-xl p-5">
  <div className="flex items-center gap-3 mb-4">
    <div className="p-2 bg-purple-500 rounded-lg">
      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 
```


## License: MIT
https://github.com/dreamyguy/gitinsight/blob/e195b7035fac141eb18b27fd8455f634cb71ef25/frontend/src/components/primitives/Icon/DocumentText.js

```
Based on the current codebase, here's where and how to properly add **Professional Fees (PF)** to your clinic management system:

## Current Structure Analysis

Your invoice system currently has:
- **Items array** - Services with unitPrice (consultation, procedures, labs, etc.)
- **Discounts** - PWD, Senior, Membership, etc.
- **Tax** - Applied to subtotal
- No dedicated Professional Fee field

## Recommended Implementation: Add PF as Separate Invoice Field

Professional Fees in Philippine medical billing are typically:
1. **Doctor's consultation fee** (separate from facility/clinic fee)
2. **Professional fee for procedures** (surgeon's fee separate from hospital)
3. **Reading fees** (radiologist/pathologist interpretation)

### Implementation Plan:

**Option 1: Add PF as Model Field** (RECOMMENDED for PH medical billing)

```typescript
// models/Invoice.ts - Add these fields:

export interface IInvoice extends Document {
  // ... existing fields ...
  items: IBillingItem[];
  subtotal?: number;
  
  // ADD THESE:
  professionalFee?: number; // Doctor/physician professional fee
  professionalFeeDoctor?: Types.ObjectId; // Which doctor gets the PF
  professionalFeeType?: 'consultation' | 'procedure' | 'reading';
  
  discounts: Array<{...}>;
  tax?: number;
  total?: number;
  // ...
}
```

**Where to add in the model file:**
```typescript
// Around line 34 in models/Invoice.ts, after items and subtotal
professionalFee: {
  type: Number,
  default: 0,
  min: 0,
},
professionalFeeDoctor: {
  type: Schema.Types.ObjectId,
  ref: 'Doctor',
},
professionalFeeType: {
  type: String,
  enum: ['consultation', 'procedure', 'reading'],
},
```

**In Invoice Form** (components/InvoiceForm.tsx):
Add PF section after Items section (around line 500):

```tsx
{/* Professional Fee Section */}
<div className="bg-gradient-to-br from-purple-50 to-purple-100/50 border border-purple-200 rounded-xl p-5">
  <div className="flex items-center gap-3 mb-4">
    <div className="p-2 bg-purple-500 rounded-lg">
      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    
```


## License: unknown
https://github.com/foundersandcoders/coursebook/blob/3e3bc52798f56ec39b46ae836306475809f9d6c9/index.11ty.js

```
Based on the current codebase, here's where and how to properly add **Professional Fees (PF)** to your clinic management system:

## Current Structure Analysis

Your invoice system currently has:
- **Items array** - Services with unitPrice (consultation, procedures, labs, etc.)
- **Discounts** - PWD, Senior, Membership, etc.
- **Tax** - Applied to subtotal
- No dedicated Professional Fee field

## Recommended Implementation: Add PF as Separate Invoice Field

Professional Fees in Philippine medical billing are typically:
1. **Doctor's consultation fee** (separate from facility/clinic fee)
2. **Professional fee for procedures** (surgeon's fee separate from hospital)
3. **Reading fees** (radiologist/pathologist interpretation)

### Implementation Plan:

**Option 1: Add PF as Model Field** (RECOMMENDED for PH medical billing)

```typescript
// models/Invoice.ts - Add these fields:

export interface IInvoice extends Document {
  // ... existing fields ...
  items: IBillingItem[];
  subtotal?: number;
  
  // ADD THESE:
  professionalFee?: number; // Doctor/physician professional fee
  professionalFeeDoctor?: Types.ObjectId; // Which doctor gets the PF
  professionalFeeType?: 'consultation' | 'procedure' | 'reading';
  
  discounts: Array<{...}>;
  tax?: number;
  total?: number;
  // ...
}
```

**Where to add in the model file:**
```typescript
// Around line 34 in models/Invoice.ts, after items and subtotal
professionalFee: {
  type: Number,
  default: 0,
  min: 0,
},
professionalFeeDoctor: {
  type: Schema.Types.ObjectId,
  ref: 'Doctor',
},
professionalFeeType: {
  type: String,
  enum: ['consultation', 'procedure', 'reading'],
},
```

**In Invoice Form** (components/InvoiceForm.tsx):
Add PF section after Items section (around line 500):

```tsx
{/* Professional Fee Section */}
<div className="bg-gradient-to-br from-purple-50 to-purple-100/50 border border-purple-200 rounded-xl p-5">
  <div className="flex items-center gap-3 mb-4">
    <div className="p-2 bg-purple-500 rounded-lg">
      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    </div>
    <h3 className="text-lg font
```


## License: unknown
https://github.com/2-fly-4-ai/t3-builds-monorepo-nx/blob/036c626e5cbe9dd8e5726fc67686c9c0e898d8f9/libs/shared/ui/src/tools/aithemegen.tsx

```
Based on the current codebase, here's where and how to properly add **Professional Fees (PF)** to your clinic management system:

## Current Structure Analysis

Your invoice system currently has:
- **Items array** - Services with unitPrice (consultation, procedures, labs, etc.)
- **Discounts** - PWD, Senior, Membership, etc.
- **Tax** - Applied to subtotal
- No dedicated Professional Fee field

## Recommended Implementation: Add PF as Separate Invoice Field

Professional Fees in Philippine medical billing are typically:
1. **Doctor's consultation fee** (separate from facility/clinic fee)
2. **Professional fee for procedures** (surgeon's fee separate from hospital)
3. **Reading fees** (radiologist/pathologist interpretation)

### Implementation Plan:

**Option 1: Add PF as Model Field** (RECOMMENDED for PH medical billing)

```typescript
// models/Invoice.ts - Add these fields:

export interface IInvoice extends Document {
  // ... existing fields ...
  items: IBillingItem[];
  subtotal?: number;
  
  // ADD THESE:
  professionalFee?: number; // Doctor/physician professional fee
  professionalFeeDoctor?: Types.ObjectId; // Which doctor gets the PF
  professionalFeeType?: 'consultation' | 'procedure' | 'reading';
  
  discounts: Array<{...}>;
  tax?: number;
  total?: number;
  // ...
}
```

**Where to add in the model file:**
```typescript
// Around line 34 in models/Invoice.ts, after items and subtotal
professionalFee: {
  type: Number,
  default: 0,
  min: 0,
},
professionalFeeDoctor: {
  type: Schema.Types.ObjectId,
  ref: 'Doctor',
},
professionalFeeType: {
  type: String,
  enum: ['consultation', 'procedure', 'reading'],
},
```

**In Invoice Form** (components/InvoiceForm.tsx):
Add PF section after Items section (around line 500):

```tsx
{/* Professional Fee Section */}
<div className="bg-gradient-to-br from-purple-50 to-purple-100/50 border border-purple-200 rounded-xl p-5">
  <div className="flex items-center gap-3 mb-4">
    <div className="p-2 bg-purple-500 rounded-lg">
      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    </div>
    <h3 className="text-lg font
```


## License: MIT
https://github.com/dreamyguy/gitinsight/blob/e195b7035fac141eb18b27fd8455f634cb71ef25/frontend/src/components/primitives/Icon/DocumentText.js

```
Based on the current codebase, here's where and how to properly add **Professional Fees (PF)** to your clinic management system:

## Current Structure Analysis

Your invoice system currently has:
- **Items array** - Services with unitPrice (consultation, procedures, labs, etc.)
- **Discounts** - PWD, Senior, Membership, etc.
- **Tax** - Applied to subtotal
- No dedicated Professional Fee field

## Recommended Implementation: Add PF as Separate Invoice Field

Professional Fees in Philippine medical billing are typically:
1. **Doctor's consultation fee** (separate from facility/clinic fee)
2. **Professional fee for procedures** (surgeon's fee separate from hospital)
3. **Reading fees** (radiologist/pathologist interpretation)

### Implementation Plan:

**Option 1: Add PF as Model Field** (RECOMMENDED for PH medical billing)

```typescript
// models/Invoice.ts - Add these fields:

export interface IInvoice extends Document {
  // ... existing fields ...
  items: IBillingItem[];
  subtotal?: number;
  
  // ADD THESE:
  professionalFee?: number; // Doctor/physician professional fee
  professionalFeeDoctor?: Types.ObjectId; // Which doctor gets the PF
  professionalFeeType?: 'consultation' | 'procedure' | 'reading';
  
  discounts: Array<{...}>;
  tax?: number;
  total?: number;
  // ...
}
```

**Where to add in the model file:**
```typescript
// Around line 34 in models/Invoice.ts, after items and subtotal
professionalFee: {
  type: Number,
  default: 0,
  min: 0,
},
professionalFeeDoctor: {
  type: Schema.Types.ObjectId,
  ref: 'Doctor',
},
professionalFeeType: {
  type: String,
  enum: ['consultation', 'procedure', 'reading'],
},
```

**In Invoice Form** (components/InvoiceForm.tsx):
Add PF section after Items section (around line 500):

```tsx
{/* Professional Fee Section */}
<div className="bg-gradient-to-br from-purple-50 to-purple-100/50 border border-purple-200 rounded-xl p-5">
  <div className="flex items-center gap-3 mb-4">
    <div className="p-2 bg-purple-500 rounded-lg">
      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    
```


## License: AGPL-3.0
https://github.com/shunkakinoki/ex-sentrei-v2/blob/9d5d8c2f5c15713df5cfc65386a8a88832290127/src/components/TabDashboard/TabDashboard.tsx

```
Based on the current codebase, here's where and how to properly add **Professional Fees (PF)** to your clinic management system:

## Current Structure Analysis

Your invoice system currently has:
- **Items array** - Services with unitPrice (consultation, procedures, labs, etc.)
- **Discounts** - PWD, Senior, Membership, etc.
- **Tax** - Applied to subtotal
- No dedicated Professional Fee field

## Recommended Implementation: Add PF as Separate Invoice Field

Professional Fees in Philippine medical billing are typically:
1. **Doctor's consultation fee** (separate from facility/clinic fee)
2. **Professional fee for procedures** (surgeon's fee separate from hospital)
3. **Reading fees** (radiologist/pathologist interpretation)

### Implementation Plan:

**Option 1: Add PF as Model Field** (RECOMMENDED for PH medical billing)

```typescript
// models/Invoice.ts - Add these fields:

export interface IInvoice extends Document {
  // ... existing fields ...
  items: IBillingItem[];
  subtotal?: number;
  
  // ADD THESE:
  professionalFee?: number; // Doctor/physician professional fee
  professionalFeeDoctor?: Types.ObjectId; // Which doctor gets the PF
  professionalFeeType?: 'consultation' | 'procedure' | 'reading';
  
  discounts: Array<{...}>;
  tax?: number;
  total?: number;
  // ...
}
```

**Where to add in the model file:**
```typescript
// Around line 34 in models/Invoice.ts, after items and subtotal
professionalFee: {
  type: Number,
  default: 0,
  min: 0,
},
professionalFeeDoctor: {
  type: Schema.Types.ObjectId,
  ref: 'Doctor',
},
professionalFeeType: {
  type: String,
  enum: ['consultation', 'procedure', 'reading'],
},
```

**In Invoice Form** (components/InvoiceForm.tsx):
Add PF section after Items section (around line 500):

```tsx
{/* Professional Fee Section */}
<div className="bg-gradient-to-br from-purple-50 to-purple-100/50 border border-purple-200 rounded-xl p-5">
  <div className="flex items-center gap-3 mb-4">
    <div className="p-2 bg-purple-500 rounded-lg">
      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    
```


## License: unknown
https://github.com/foundersandcoders/coursebook/blob/3e3bc52798f56ec39b46ae836306475809f9d6c9/index.11ty.js

```
Based on the current codebase, here's where and how to properly add **Professional Fees (PF)** to your clinic management system:

## Current Structure Analysis

Your invoice system currently has:
- **Items array** - Services with unitPrice (consultation, procedures, labs, etc.)
- **Discounts** - PWD, Senior, Membership, etc.
- **Tax** - Applied to subtotal
- No dedicated Professional Fee field

## Recommended Implementation: Add PF as Separate Invoice Field

Professional Fees in Philippine medical billing are typically:
1. **Doctor's consultation fee** (separate from facility/clinic fee)
2. **Professional fee for procedures** (surgeon's fee separate from hospital)
3. **Reading fees** (radiologist/pathologist interpretation)

### Implementation Plan:

**Option 1: Add PF as Model Field** (RECOMMENDED for PH medical billing)

```typescript
// models/Invoice.ts - Add these fields:

export interface IInvoice extends Document {
  // ... existing fields ...
  items: IBillingItem[];
  subtotal?: number;
  
  // ADD THESE:
  professionalFee?: number; // Doctor/physician professional fee
  professionalFeeDoctor?: Types.ObjectId; // Which doctor gets the PF
  professionalFeeType?: 'consultation' | 'procedure' | 'reading';
  
  discounts: Array<{...}>;
  tax?: number;
  total?: number;
  // ...
}
```

**Where to add in the model file:**
```typescript
// Around line 34 in models/Invoice.ts, after items and subtotal
professionalFee: {
  type: Number,
  default: 0,
  min: 0,
},
professionalFeeDoctor: {
  type: Schema.Types.ObjectId,
  ref: 'Doctor',
},
professionalFeeType: {
  type: String,
  enum: ['consultation', 'procedure', 'reading'],
},
```

**In Invoice Form** (components/InvoiceForm.tsx):
Add PF section after Items section (around line 500):

```tsx
{/* Professional Fee Section */}
<div className="bg-gradient-to-br from-purple-50 to-purple-100/50 border border-purple-200 rounded-xl p-5">
  <div className="flex items-center gap-3 mb-4">
    <div className="p-2 bg-purple-500 rounded-lg">
      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    </div>
    <h3 className="text-lg font
```


## License: unknown
https://github.com/2-fly-4-ai/t3-builds-monorepo-nx/blob/036c626e5cbe9dd8e5726fc67686c9c0e898d8f9/libs/shared/ui/src/tools/aithemegen.tsx

```
Based on the current codebase, here's where and how to properly add **Professional Fees (PF)** to your clinic management system:

## Current Structure Analysis

Your invoice system currently has:
- **Items array** - Services with unitPrice (consultation, procedures, labs, etc.)
- **Discounts** - PWD, Senior, Membership, etc.
- **Tax** - Applied to subtotal
- No dedicated Professional Fee field

## Recommended Implementation: Add PF as Separate Invoice Field

Professional Fees in Philippine medical billing are typically:
1. **Doctor's consultation fee** (separate from facility/clinic fee)
2. **Professional fee for procedures** (surgeon's fee separate from hospital)
3. **Reading fees** (radiologist/pathologist interpretation)

### Implementation Plan:

**Option 1: Add PF as Model Field** (RECOMMENDED for PH medical billing)

```typescript
// models/Invoice.ts - Add these fields:

export interface IInvoice extends Document {
  // ... existing fields ...
  items: IBillingItem[];
  subtotal?: number;
  
  // ADD THESE:
  professionalFee?: number; // Doctor/physician professional fee
  professionalFeeDoctor?: Types.ObjectId; // Which doctor gets the PF
  professionalFeeType?: 'consultation' | 'procedure' | 'reading';
  
  discounts: Array<{...}>;
  tax?: number;
  total?: number;
  // ...
}
```

**Where to add in the model file:**
```typescript
// Around line 34 in models/Invoice.ts, after items and subtotal
professionalFee: {
  type: Number,
  default: 0,
  min: 0,
},
professionalFeeDoctor: {
  type: Schema.Types.ObjectId,
  ref: 'Doctor',
},
professionalFeeType: {
  type: String,
  enum: ['consultation', 'procedure', 'reading'],
},
```

**In Invoice Form** (components/InvoiceForm.tsx):
Add PF section after Items section (around line 500):

```tsx
{/* Professional Fee Section */}
<div className="bg-gradient-to-br from-purple-50 to-purple-100/50 border border-purple-200 rounded-xl p-5">
  <div className="flex items-center gap-3 mb-4">
    <div className="p-2 bg-purple-500 rounded-lg">
      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    </div>
    <h3 className="text-lg font
```


## License: MIT
https://github.com/dreamyguy/gitinsight/blob/e195b7035fac141eb18b27fd8455f634cb71ef25/frontend/src/components/primitives/Icon/DocumentText.js

```
Based on the current codebase, here's where and how to properly add **Professional Fees (PF)** to your clinic management system:

## Current Structure Analysis

Your invoice system currently has:
- **Items array** - Services with unitPrice (consultation, procedures, labs, etc.)
- **Discounts** - PWD, Senior, Membership, etc.
- **Tax** - Applied to subtotal
- No dedicated Professional Fee field

## Recommended Implementation: Add PF as Separate Invoice Field

Professional Fees in Philippine medical billing are typically:
1. **Doctor's consultation fee** (separate from facility/clinic fee)
2. **Professional fee for procedures** (surgeon's fee separate from hospital)
3. **Reading fees** (radiologist/pathologist interpretation)

### Implementation Plan:

**Option 1: Add PF as Model Field** (RECOMMENDED for PH medical billing)

```typescript
// models/Invoice.ts - Add these fields:

export interface IInvoice extends Document {
  // ... existing fields ...
  items: IBillingItem[];
  subtotal?: number;
  
  // ADD THESE:
  professionalFee?: number; // Doctor/physician professional fee
  professionalFeeDoctor?: Types.ObjectId; // Which doctor gets the PF
  professionalFeeType?: 'consultation' | 'procedure' | 'reading';
  
  discounts: Array<{...}>;
  tax?: number;
  total?: number;
  // ...
}
```

**Where to add in the model file:**
```typescript
// Around line 34 in models/Invoice.ts, after items and subtotal
professionalFee: {
  type: Number,
  default: 0,
  min: 0,
},
professionalFeeDoctor: {
  type: Schema.Types.ObjectId,
  ref: 'Doctor',
},
professionalFeeType: {
  type: String,
  enum: ['consultation', 'procedure', 'reading'],
},
```

**In Invoice Form** (components/InvoiceForm.tsx):
Add PF section after Items section (around line 500):

```tsx
{/* Professional Fee Section */}
<div className="bg-gradient-to-br from-purple-50 to-purple-100/50 border border-purple-200 rounded-xl p-5">
  <div className="flex items-center gap-3 mb-4">
    <div className="p-2 bg-purple-500 rounded-lg">
      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    
```


## License: AGPL-3.0
https://github.com/shunkakinoki/ex-sentrei-v2/blob/9d5d8c2f5c15713df5cfc65386a8a88832290127/src/components/TabDashboard/TabDashboard.tsx

```
Based on the current codebase, here's where and how to properly add **Professional Fees (PF)** to your clinic management system:

## Current Structure Analysis

Your invoice system currently has:
- **Items array** - Services with unitPrice (consultation, procedures, labs, etc.)
- **Discounts** - PWD, Senior, Membership, etc.
- **Tax** - Applied to subtotal
- No dedicated Professional Fee field

## Recommended Implementation: Add PF as Separate Invoice Field

Professional Fees in Philippine medical billing are typically:
1. **Doctor's consultation fee** (separate from facility/clinic fee)
2. **Professional fee for procedures** (surgeon's fee separate from hospital)
3. **Reading fees** (radiologist/pathologist interpretation)

### Implementation Plan:

**Option 1: Add PF as Model Field** (RECOMMENDED for PH medical billing)

```typescript
// models/Invoice.ts - Add these fields:

export interface IInvoice extends Document {
  // ... existing fields ...
  items: IBillingItem[];
  subtotal?: number;
  
  // ADD THESE:
  professionalFee?: number; // Doctor/physician professional fee
  professionalFeeDoctor?: Types.ObjectId; // Which doctor gets the PF
  professionalFeeType?: 'consultation' | 'procedure' | 'reading';
  
  discounts: Array<{...}>;
  tax?: number;
  total?: number;
  // ...
}
```

**Where to add in the model file:**
```typescript
// Around line 34 in models/Invoice.ts, after items and subtotal
professionalFee: {
  type: Number,
  default: 0,
  min: 0,
},
professionalFeeDoctor: {
  type: Schema.Types.ObjectId,
  ref: 'Doctor',
},
professionalFeeType: {
  type: String,
  enum: ['consultation', 'procedure', 'reading'],
},
```

**In Invoice Form** (components/InvoiceForm.tsx):
Add PF section after Items section (around line 500):

```tsx
{/* Professional Fee Section */}
<div className="bg-gradient-to-br from-purple-50 to-purple-100/50 border border-purple-200 rounded-xl p-5">
  <div className="flex items-center gap-3 mb-4">
    <div className="p-2 bg-purple-500 rounded-lg">
      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    
```


## License: unknown
https://github.com/foundersandcoders/coursebook/blob/3e3bc52798f56ec39b46ae836306475809f9d6c9/index.11ty.js

```
Based on the current codebase, here's where and how to properly add **Professional Fees (PF)** to your clinic management system:

## Current Structure Analysis

Your invoice system currently has:
- **Items array** - Services with unitPrice (consultation, procedures, labs, etc.)
- **Discounts** - PWD, Senior, Membership, etc.
- **Tax** - Applied to subtotal
- No dedicated Professional Fee field

## Recommended Implementation: Add PF as Separate Invoice Field

Professional Fees in Philippine medical billing are typically:
1. **Doctor's consultation fee** (separate from facility/clinic fee)
2. **Professional fee for procedures** (surgeon's fee separate from hospital)
3. **Reading fees** (radiologist/pathologist interpretation)

### Implementation Plan:

**Option 1: Add PF as Model Field** (RECOMMENDED for PH medical billing)

```typescript
// models/Invoice.ts - Add these fields:

export interface IInvoice extends Document {
  // ... existing fields ...
  items: IBillingItem[];
  subtotal?: number;
  
  // ADD THESE:
  professionalFee?: number; // Doctor/physician professional fee
  professionalFeeDoctor?: Types.ObjectId; // Which doctor gets the PF
  professionalFeeType?: 'consultation' | 'procedure' | 'reading';
  
  discounts: Array<{...}>;
  tax?: number;
  total?: number;
  // ...
}
```

**Where to add in the model file:**
```typescript
// Around line 34 in models/Invoice.ts, after items and subtotal
professionalFee: {
  type: Number,
  default: 0,
  min: 0,
},
professionalFeeDoctor: {
  type: Schema.Types.ObjectId,
  ref: 'Doctor',
},
professionalFeeType: {
  type: String,
  enum: ['consultation', 'procedure', 'reading'],
},
```

**In Invoice Form** (components/InvoiceForm.tsx):
Add PF section after Items section (around line 500):

```tsx
{/* Professional Fee Section */}
<div className="bg-gradient-to-br from-purple-50 to-purple-100/50 border border-purple-200 rounded-xl p-5">
  <div className="flex items-center gap-3 mb-4">
    <div className="p-2 bg-purple-500 rounded-lg">
      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    </div>
    <h3 className="text-lg font
```


## License: unknown
https://github.com/2-fly-4-ai/t3-builds-monorepo-nx/blob/036c626e5cbe9dd8e5726fc67686c9c0e898d8f9/libs/shared/ui/src/tools/aithemegen.tsx

```
Based on the current codebase, here's where and how to properly add **Professional Fees (PF)** to your clinic management system:

## Current Structure Analysis

Your invoice system currently has:
- **Items array** - Services with unitPrice (consultation, procedures, labs, etc.)
- **Discounts** - PWD, Senior, Membership, etc.
- **Tax** - Applied to subtotal
- No dedicated Professional Fee field

## Recommended Implementation: Add PF as Separate Invoice Field

Professional Fees in Philippine medical billing are typically:
1. **Doctor's consultation fee** (separate from facility/clinic fee)
2. **Professional fee for procedures** (surgeon's fee separate from hospital)
3. **Reading fees** (radiologist/pathologist interpretation)

### Implementation Plan:

**Option 1: Add PF as Model Field** (RECOMMENDED for PH medical billing)

```typescript
// models/Invoice.ts - Add these fields:

export interface IInvoice extends Document {
  // ... existing fields ...
  items: IBillingItem[];
  subtotal?: number;
  
  // ADD THESE:
  professionalFee?: number; // Doctor/physician professional fee
  professionalFeeDoctor?: Types.ObjectId; // Which doctor gets the PF
  professionalFeeType?: 'consultation' | 'procedure' | 'reading';
  
  discounts: Array<{...}>;
  tax?: number;
  total?: number;
  // ...
}
```

**Where to add in the model file:**
```typescript
// Around line 34 in models/Invoice.ts, after items and subtotal
professionalFee: {
  type: Number,
  default: 0,
  min: 0,
},
professionalFeeDoctor: {
  type: Schema.Types.ObjectId,
  ref: 'Doctor',
},
professionalFeeType: {
  type: String,
  enum: ['consultation', 'procedure', 'reading'],
},
```

**In Invoice Form** (components/InvoiceForm.tsx):
Add PF section after Items section (around line 500):

```tsx
{/* Professional Fee Section */}
<div className="bg-gradient-to-br from-purple-50 to-purple-100/50 border border-purple-200 rounded-xl p-5">
  <div className="flex items-center gap-3 mb-4">
    <div className="p-2 bg-purple-500 rounded-lg">
      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    </div>
    <h3 className="text-lg font
```


## License: MIT
https://github.com/dreamyguy/gitinsight/blob/e195b7035fac141eb18b27fd8455f634cb71ef25/frontend/src/components/primitives/Icon/DocumentText.js

```
Based on the current codebase, here's where and how to properly add **Professional Fees (PF)** to your clinic management system:

## Current Structure Analysis

Your invoice system currently has:
- **Items array** - Services with unitPrice (consultation, procedures, labs, etc.)
- **Discounts** - PWD, Senior, Membership, etc.
- **Tax** - Applied to subtotal
- No dedicated Professional Fee field

## Recommended Implementation: Add PF as Separate Invoice Field

Professional Fees in Philippine medical billing are typically:
1. **Doctor's consultation fee** (separate from facility/clinic fee)
2. **Professional fee for procedures** (surgeon's fee separate from hospital)
3. **Reading fees** (radiologist/pathologist interpretation)

### Implementation Plan:

**Option 1: Add PF as Model Field** (RECOMMENDED for PH medical billing)

```typescript
// models/Invoice.ts - Add these fields:

export interface IInvoice extends Document {
  // ... existing fields ...
  items: IBillingItem[];
  subtotal?: number;
  
  // ADD THESE:
  professionalFee?: number; // Doctor/physician professional fee
  professionalFeeDoctor?: Types.ObjectId; // Which doctor gets the PF
  professionalFeeType?: 'consultation' | 'procedure' | 'reading';
  
  discounts: Array<{...}>;
  tax?: number;
  total?: number;
  // ...
}
```

**Where to add in the model file:**
```typescript
// Around line 34 in models/Invoice.ts, after items and subtotal
professionalFee: {
  type: Number,
  default: 0,
  min: 0,
},
professionalFeeDoctor: {
  type: Schema.Types.ObjectId,
  ref: 'Doctor',
},
professionalFeeType: {
  type: String,
  enum: ['consultation', 'procedure', 'reading'],
},
```

**In Invoice Form** (components/InvoiceForm.tsx):
Add PF section after Items section (around line 500):

```tsx
{/* Professional Fee Section */}
<div className="bg-gradient-to-br from-purple-50 to-purple-100/50 border border-purple-200 rounded-xl p-5">
  <div className="flex items-center gap-3 mb-4">
    <div className="p-2 bg-purple-500 rounded-lg">
      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    </div>
    <h3 className="text-lg font
```


## License: unknown
https://github.com/foundersandcoders/coursebook/blob/3e3bc52798f56ec39b46ae836306475809f9d6c9/index.11ty.js

```
Based on the current codebase, here's where and how to properly add **Professional Fees (PF)** to your clinic management system:

## Current Structure Analysis

Your invoice system currently has:
- **Items array** - Services with unitPrice (consultation, procedures, labs, etc.)
- **Discounts** - PWD, Senior, Membership, etc.
- **Tax** - Applied to subtotal
- No dedicated Professional Fee field

## Recommended Implementation: Add PF as Separate Invoice Field

Professional Fees in Philippine medical billing are typically:
1. **Doctor's consultation fee** (separate from facility/clinic fee)
2. **Professional fee for procedures** (surgeon's fee separate from hospital)
3. **Reading fees** (radiologist/pathologist interpretation)

### Implementation Plan:

**Option 1: Add PF as Model Field** (RECOMMENDED for PH medical billing)

```typescript
// models/Invoice.ts - Add these fields:

export interface IInvoice extends Document {
  // ... existing fields ...
  items: IBillingItem[];
  subtotal?: number;
  
  // ADD THESE:
  professionalFee?: number; // Doctor/physician professional fee
  professionalFeeDoctor?: Types.ObjectId; // Which doctor gets the PF
  professionalFeeType?: 'consultation' | 'procedure' | 'reading';
  
  discounts: Array<{...}>;
  tax?: number;
  total?: number;
  // ...
}
```

**Where to add in the model file:**
```typescript
// Around line 34 in models/Invoice.ts, after items and subtotal
professionalFee: {
  type: Number,
  default: 0,
  min: 0,
},
professionalFeeDoctor: {
  type: Schema.Types.ObjectId,
  ref: 'Doctor',
},
professionalFeeType: {
  type: String,
  enum: ['consultation', 'procedure', 'reading'],
},
```

**In Invoice Form** (components/InvoiceForm.tsx):
Add PF section after Items section (around line 500):

```tsx
{/* Professional Fee Section */}
<div className="bg-gradient-to-br from-purple-50 to-purple-100/50 border border-purple-200 rounded-xl p-5">
  <div className="flex items-center gap-3 mb-4">
    <div className="p-2 bg-purple-500 rounded-lg">
      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    </div>
    <h3 className="text-lg font
```


## License: AGPL-3.0
https://github.com/shunkakinoki/ex-sentrei-v2/blob/9d5d8c2f5c15713df5cfc65386a8a88832290127/src/components/TabDashboard/TabDashboard.tsx

```
Based on the current codebase, here's where and how to properly add **Professional Fees (PF)** to your clinic management system:

## Current Structure Analysis

Your invoice system currently has:
- **Items array** - Services with unitPrice (consultation, procedures, labs, etc.)
- **Discounts** - PWD, Senior, Membership, etc.
- **Tax** - Applied to subtotal
- No dedicated Professional Fee field

## Recommended Implementation: Add PF as Separate Invoice Field

Professional Fees in Philippine medical billing are typically:
1. **Doctor's consultation fee** (separate from facility/clinic fee)
2. **Professional fee for procedures** (surgeon's fee separate from hospital)
3. **Reading fees** (radiologist/pathologist interpretation)

### Implementation Plan:

**Option 1: Add PF as Model Field** (RECOMMENDED for PH medical billing)

```typescript
// models/Invoice.ts - Add these fields:

export interface IInvoice extends Document {
  // ... existing fields ...
  items: IBillingItem[];
  subtotal?: number;
  
  // ADD THESE:
  professionalFee?: number; // Doctor/physician professional fee
  professionalFeeDoctor?: Types.ObjectId; // Which doctor gets the PF
  professionalFeeType?: 'consultation' | 'procedure' | 'reading';
  
  discounts: Array<{...}>;
  tax?: number;
  total?: number;
  // ...
}
```

**Where to add in the model file:**
```typescript
// Around line 34 in models/Invoice.ts, after items and subtotal
professionalFee: {
  type: Number,
  default: 0,
  min: 0,
},
professionalFeeDoctor: {
  type: Schema.Types.ObjectId,
  ref: 'Doctor',
},
professionalFeeType: {
  type: String,
  enum: ['consultation', 'procedure', 'reading'],
},
```

**In Invoice Form** (components/InvoiceForm.tsx):
Add PF section after Items section (around line 500):

```tsx
{/* Professional Fee Section */}
<div className="bg-gradient-to-br from-purple-50 to-purple-100/50 border border-purple-200 rounded-xl p-5">
  <div className="flex items-center gap-3 mb-4">
    <div className="p-2 bg-purple-500 rounded-lg">
      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    </div>
    <h3 className="text-lg font
```


## License: unknown
https://github.com/2-fly-4-ai/t3-builds-monorepo-nx/blob/036c626e5cbe9dd8e5726fc67686c9c0e898d8f9/libs/shared/ui/src/tools/aithemegen.tsx

```
Based on the current codebase, here's where and how to properly add **Professional Fees (PF)** to your clinic management system:

## Current Structure Analysis

Your invoice system currently has:
- **Items array** - Services with unitPrice (consultation, procedures, labs, etc.)
- **Discounts** - PWD, Senior, Membership, etc.
- **Tax** - Applied to subtotal
- No dedicated Professional Fee field

## Recommended Implementation: Add PF as Separate Invoice Field

Professional Fees in Philippine medical billing are typically:
1. **Doctor's consultation fee** (separate from facility/clinic fee)
2. **Professional fee for procedures** (surgeon's fee separate from hospital)
3. **Reading fees** (radiologist/pathologist interpretation)

### Implementation Plan:

**Option 1: Add PF as Model Field** (RECOMMENDED for PH medical billing)

```typescript
// models/Invoice.ts - Add these fields:

export interface IInvoice extends Document {
  // ... existing fields ...
  items: IBillingItem[];
  subtotal?: number;
  
  // ADD THESE:
  professionalFee?: number; // Doctor/physician professional fee
  professionalFeeDoctor?: Types.ObjectId; // Which doctor gets the PF
  professionalFeeType?: 'consultation' | 'procedure' | 'reading';
  
  discounts: Array<{...}>;
  tax?: number;
  total?: number;
  // ...
}
```

**Where to add in the model file:**
```typescript
// Around line 34 in models/Invoice.ts, after items and subtotal
professionalFee: {
  type: Number,
  default: 0,
  min: 0,
},
professionalFeeDoctor: {
  type: Schema.Types.ObjectId,
  ref: 'Doctor',
},
professionalFeeType: {
  type: String,
  enum: ['consultation', 'procedure', 'reading'],
},
```

**In Invoice Form** (components/InvoiceForm.tsx):
Add PF section after Items section (around line 500):

```tsx
{/* Professional Fee Section */}
<div className="bg-gradient-to-br from-purple-50 to-purple-100/50 border border-purple-200 rounded-xl p-5">
  <div className="flex items-center gap-3 mb-4">
    <div className="p-2 bg-purple-500 rounded-lg">
      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    </div>
    <h3 className="text-lg font
```


## License: MIT
https://github.com/dreamyguy/gitinsight/blob/e195b7035fac141eb18b27fd8455f634cb71ef25/frontend/src/components/primitives/Icon/DocumentText.js

```
Based on the current codebase, here's where and how to properly add **Professional Fees (PF)** to your clinic management system:

## Current Structure Analysis

Your invoice system currently has:
- **Items array** - Services with unitPrice (consultation, procedures, labs, etc.)
- **Discounts** - PWD, Senior, Membership, etc.
- **Tax** - Applied to subtotal
- No dedicated Professional Fee field

## Recommended Implementation: Add PF as Separate Invoice Field

Professional Fees in Philippine medical billing are typically:
1. **Doctor's consultation fee** (separate from facility/clinic fee)
2. **Professional fee for procedures** (surgeon's fee separate from hospital)
3. **Reading fees** (radiologist/pathologist interpretation)

### Implementation Plan:

**Option 1: Add PF as Model Field** (RECOMMENDED for PH medical billing)

```typescript
// models/Invoice.ts - Add these fields:

export interface IInvoice extends Document {
  // ... existing fields ...
  items: IBillingItem[];
  subtotal?: number;
  
  // ADD THESE:
  professionalFee?: number; // Doctor/physician professional fee
  professionalFeeDoctor?: Types.ObjectId; // Which doctor gets the PF
  professionalFeeType?: 'consultation' | 'procedure' | 'reading';
  
  discounts: Array<{...}>;
  tax?: number;
  total?: number;
  // ...
}
```

**Where to add in the model file:**
```typescript
// Around line 34 in models/Invoice.ts, after items and subtotal
professionalFee: {
  type: Number,
  default: 0,
  min: 0,
},
professionalFeeDoctor: {
  type: Schema.Types.ObjectId,
  ref: 'Doctor',
},
professionalFeeType: {
  type: String,
  enum: ['consultation', 'procedure', 'reading'],
},
```

**In Invoice Form** (components/InvoiceForm.tsx):
Add PF section after Items section (around line 500):

```tsx
{/* Professional Fee Section */}
<div className="bg-gradient-to-br from-purple-50 to-purple-100/50 border border-purple-200 rounded-xl p-5">
  <div className="flex items-center gap-3 mb-4">
    <div className="p-2 bg-purple-500 rounded-lg">
      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    </div>
    <h3 className="text-lg font
```


## License: unknown
https://github.com/foundersandcoders/coursebook/blob/3e3bc52798f56ec39b46ae836306475809f9d6c9/index.11ty.js

```
Based on the current codebase, here's where and how to properly add **Professional Fees (PF)** to your clinic management system:

## Current Structure Analysis

Your invoice system currently has:
- **Items array** - Services with unitPrice (consultation, procedures, labs, etc.)
- **Discounts** - PWD, Senior, Membership, etc.
- **Tax** - Applied to subtotal
- No dedicated Professional Fee field

## Recommended Implementation: Add PF as Separate Invoice Field

Professional Fees in Philippine medical billing are typically:
1. **Doctor's consultation fee** (separate from facility/clinic fee)
2. **Professional fee for procedures** (surgeon's fee separate from hospital)
3. **Reading fees** (radiologist/pathologist interpretation)

### Implementation Plan:

**Option 1: Add PF as Model Field** (RECOMMENDED for PH medical billing)

```typescript
// models/Invoice.ts - Add these fields:

export interface IInvoice extends Document {
  // ... existing fields ...
  items: IBillingItem[];
  subtotal?: number;
  
  // ADD THESE:
  professionalFee?: number; // Doctor/physician professional fee
  professionalFeeDoctor?: Types.ObjectId; // Which doctor gets the PF
  professionalFeeType?: 'consultation' | 'procedure' | 'reading';
  
  discounts: Array<{...}>;
  tax?: number;
  total?: number;
  // ...
}
```

**Where to add in the model file:**
```typescript
// Around line 34 in models/Invoice.ts, after items and subtotal
professionalFee: {
  type: Number,
  default: 0,
  min: 0,
},
professionalFeeDoctor: {
  type: Schema.Types.ObjectId,
  ref: 'Doctor',
},
professionalFeeType: {
  type: String,
  enum: ['consultation', 'procedure', 'reading'],
},
```

**In Invoice Form** (components/InvoiceForm.tsx):
Add PF section after Items section (around line 500):

```tsx
{/* Professional Fee Section */}
<div className="bg-gradient-to-br from-purple-50 to-purple-100/50 border border-purple-200 rounded-xl p-5">
  <div className="flex items-center gap-3 mb-4">
    <div className="p-2 bg-purple-500 rounded-lg">
      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    </div>
    <h3 className="text-lg font
```


## License: AGPL-3.0
https://github.com/shunkakinoki/ex-sentrei-v2/blob/9d5d8c2f5c15713df5cfc65386a8a88832290127/src/components/TabDashboard/TabDashboard.tsx

```
Based on the current codebase, here's where and how to properly add **Professional Fees (PF)** to your clinic management system:

## Current Structure Analysis

Your invoice system currently has:
- **Items array** - Services with unitPrice (consultation, procedures, labs, etc.)
- **Discounts** - PWD, Senior, Membership, etc.
- **Tax** - Applied to subtotal
- No dedicated Professional Fee field

## Recommended Implementation: Add PF as Separate Invoice Field

Professional Fees in Philippine medical billing are typically:
1. **Doctor's consultation fee** (separate from facility/clinic fee)
2. **Professional fee for procedures** (surgeon's fee separate from hospital)
3. **Reading fees** (radiologist/pathologist interpretation)

### Implementation Plan:

**Option 1: Add PF as Model Field** (RECOMMENDED for PH medical billing)

```typescript
// models/Invoice.ts - Add these fields:

export interface IInvoice extends Document {
  // ... existing fields ...
  items: IBillingItem[];
  subtotal?: number;
  
  // ADD THESE:
  professionalFee?: number; // Doctor/physician professional fee
  professionalFeeDoctor?: Types.ObjectId; // Which doctor gets the PF
  professionalFeeType?: 'consultation' | 'procedure' | 'reading';
  
  discounts: Array<{...}>;
  tax?: number;
  total?: number;
  // ...
}
```

**Where to add in the model file:**
```typescript
// Around line 34 in models/Invoice.ts, after items and subtotal
professionalFee: {
  type: Number,
  default: 0,
  min: 0,
},
professionalFeeDoctor: {
  type: Schema.Types.ObjectId,
  ref: 'Doctor',
},
professionalFeeType: {
  type: String,
  enum: ['consultation', 'procedure', 'reading'],
},
```

**In Invoice Form** (components/InvoiceForm.tsx):
Add PF section after Items section (around line 500):

```tsx
{/* Professional Fee Section */}
<div className="bg-gradient-to-br from-purple-50 to-purple-100/50 border border-purple-200 rounded-xl p-5">
  <div className="flex items-center gap-3 mb-4">
    <div className="p-2 bg-purple-500 rounded-lg">
      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    </div>
    <h3 className="text-lg font
```


## License: unknown
https://github.com/2-fly-4-ai/t3-builds-monorepo-nx/blob/036c626e5cbe9dd8e5726fc67686c9c0e898d8f9/libs/shared/ui/src/tools/aithemegen.tsx

```
Based on the current codebase, here's where and how to properly add **Professional Fees (PF)** to your clinic management system:

## Current Structure Analysis

Your invoice system currently has:
- **Items array** - Services with unitPrice (consultation, procedures, labs, etc.)
- **Discounts** - PWD, Senior, Membership, etc.
- **Tax** - Applied to subtotal
- No dedicated Professional Fee field

## Recommended Implementation: Add PF as Separate Invoice Field

Professional Fees in Philippine medical billing are typically:
1. **Doctor's consultation fee** (separate from facility/clinic fee)
2. **Professional fee for procedures** (surgeon's fee separate from hospital)
3. **Reading fees** (radiologist/pathologist interpretation)

### Implementation Plan:

**Option 1: Add PF as Model Field** (RECOMMENDED for PH medical billing)

```typescript
// models/Invoice.ts - Add these fields:

export interface IInvoice extends Document {
  // ... existing fields ...
  items: IBillingItem[];
  subtotal?: number;
  
  // ADD THESE:
  professionalFee?: number; // Doctor/physician professional fee
  professionalFeeDoctor?: Types.ObjectId; // Which doctor gets the PF
  professionalFeeType?: 'consultation' | 'procedure' | 'reading';
  
  discounts: Array<{...}>;
  tax?: number;
  total?: number;
  // ...
}
```

**Where to add in the model file:**
```typescript
// Around line 34 in models/Invoice.ts, after items and subtotal
professionalFee: {
  type: Number,
  default: 0,
  min: 0,
},
professionalFeeDoctor: {
  type: Schema.Types.ObjectId,
  ref: 'Doctor',
},
professionalFeeType: {
  type: String,
  enum: ['consultation', 'procedure', 'reading'],
},
```

**In Invoice Form** (components/InvoiceForm.tsx):
Add PF section after Items section (around line 500):

```tsx
{/* Professional Fee Section */}
<div className="bg-gradient-to-br from-purple-50 to-purple-100/50 border border-purple-200 rounded-xl p-5">
  <div className="flex items-center gap-3 mb-4">
    <div className="p-2 bg-purple-500 rounded-lg">
      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    </div>
    <h3 className="text-lg font
```


## License: MIT
https://github.com/dreamyguy/gitinsight/blob/e195b7035fac141eb18b27fd8455f634cb71ef25/frontend/src/components/primitives/Icon/DocumentText.js

```
Based on the current codebase, here's where and how to properly add **Professional Fees (PF)** to your clinic management system:

## Current Structure Analysis

Your invoice system currently has:
- **Items array** - Services with unitPrice (consultation, procedures, labs, etc.)
- **Discounts** - PWD, Senior, Membership, etc.
- **Tax** - Applied to subtotal
- No dedicated Professional Fee field

## Recommended Implementation: Add PF as Separate Invoice Field

Professional Fees in Philippine medical billing are typically:
1. **Doctor's consultation fee** (separate from facility/clinic fee)
2. **Professional fee for procedures** (surgeon's fee separate from hospital)
3. **Reading fees** (radiologist/pathologist interpretation)

### Implementation Plan:

**Option 1: Add PF as Model Field** (RECOMMENDED for PH medical billing)

```typescript
// models/Invoice.ts - Add these fields:

export interface IInvoice extends Document {
  // ... existing fields ...
  items: IBillingItem[];
  subtotal?: number;
  
  // ADD THESE:
  professionalFee?: number; // Doctor/physician professional fee
  professionalFeeDoctor?: Types.ObjectId; // Which doctor gets the PF
  professionalFeeType?: 'consultation' | 'procedure' | 'reading';
  
  discounts: Array<{...}>;
  tax?: number;
  total?: number;
  // ...
}
```

**Where to add in the model file:**
```typescript
// Around line 34 in models/Invoice.ts, after items and subtotal
professionalFee: {
  type: Number,
  default: 0,
  min: 0,
},
professionalFeeDoctor: {
  type: Schema.Types.ObjectId,
  ref: 'Doctor',
},
professionalFeeType: {
  type: String,
  enum: ['consultation', 'procedure', 'reading'],
},
```

**In Invoice Form** (components/InvoiceForm.tsx):
Add PF section after Items section (around line 500):

```tsx
{/* Professional Fee Section */}
<div className="bg-gradient-to-br from-purple-50 to-purple-100/50 border border-purple-200 rounded-xl p-5">
  <div className="flex items-center gap-3 mb-4">
    <div className="p-2 bg-purple-500 rounded-lg">
      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    </div>
    <h3 className="text-lg font
```


## License: unknown
https://github.com/foundersandcoders/coursebook/blob/3e3bc52798f56ec39b46ae836306475809f9d6c9/index.11ty.js

```
Based on the current codebase, here's where and how to properly add **Professional Fees (PF)** to your clinic management system:

## Current Structure Analysis

Your invoice system currently has:
- **Items array** - Services with unitPrice (consultation, procedures, labs, etc.)
- **Discounts** - PWD, Senior, Membership, etc.
- **Tax** - Applied to subtotal
- No dedicated Professional Fee field

## Recommended Implementation: Add PF as Separate Invoice Field

Professional Fees in Philippine medical billing are typically:
1. **Doctor's consultation fee** (separate from facility/clinic fee)
2. **Professional fee for procedures** (surgeon's fee separate from hospital)
3. **Reading fees** (radiologist/pathologist interpretation)

### Implementation Plan:

**Option 1: Add PF as Model Field** (RECOMMENDED for PH medical billing)

```typescript
// models/Invoice.ts - Add these fields:

export interface IInvoice extends Document {
  // ... existing fields ...
  items: IBillingItem[];
  subtotal?: number;
  
  // ADD THESE:
  professionalFee?: number; // Doctor/physician professional fee
  professionalFeeDoctor?: Types.ObjectId; // Which doctor gets the PF
  professionalFeeType?: 'consultation' | 'procedure' | 'reading';
  
  discounts: Array<{...}>;
  tax?: number;
  total?: number;
  // ...
}
```

**Where to add in the model file:**
```typescript
// Around line 34 in models/Invoice.ts, after items and subtotal
professionalFee: {
  type: Number,
  default: 0,
  min: 0,
},
professionalFeeDoctor: {
  type: Schema.Types.ObjectId,
  ref: 'Doctor',
},
professionalFeeType: {
  type: String,
  enum: ['consultation', 'procedure', 'reading'],
},
```

**In Invoice Form** (components/InvoiceForm.tsx):
Add PF section after Items section (around line 500):

```tsx
{/* Professional Fee Section */}
<div className="bg-gradient-to-br from-purple-50 to-purple-100/50 border border-purple-200 rounded-xl p-5">
  <div className="flex items-center gap-3 mb-4">
    <div className="p-2 bg-purple-500 rounded-lg">
      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    </div>
    <h3 className="text-lg font
```


## License: AGPL-3.0
https://github.com/shunkakinoki/ex-sentrei-v2/blob/9d5d8c2f5c15713df5cfc65386a8a88832290127/src/components/TabDashboard/TabDashboard.tsx

```
Based on the current codebase, here's where and how to properly add **Professional Fees (PF)** to your clinic management system:

## Current Structure Analysis

Your invoice system currently has:
- **Items array** - Services with unitPrice (consultation, procedures, labs, etc.)
- **Discounts** - PWD, Senior, Membership, etc.
- **Tax** - Applied to subtotal
- No dedicated Professional Fee field

## Recommended Implementation: Add PF as Separate Invoice Field

Professional Fees in Philippine medical billing are typically:
1. **Doctor's consultation fee** (separate from facility/clinic fee)
2. **Professional fee for procedures** (surgeon's fee separate from hospital)
3. **Reading fees** (radiologist/pathologist interpretation)

### Implementation Plan:

**Option 1: Add PF as Model Field** (RECOMMENDED for PH medical billing)

```typescript
// models/Invoice.ts - Add these fields:

export interface IInvoice extends Document {
  // ... existing fields ...
  items: IBillingItem[];
  subtotal?: number;
  
  // ADD THESE:
  professionalFee?: number; // Doctor/physician professional fee
  professionalFeeDoctor?: Types.ObjectId; // Which doctor gets the PF
  professionalFeeType?: 'consultation' | 'procedure' | 'reading';
  
  discounts: Array<{...}>;
  tax?: number;
  total?: number;
  // ...
}
```

**Where to add in the model file:**
```typescript
// Around line 34 in models/Invoice.ts, after items and subtotal
professionalFee: {
  type: Number,
  default: 0,
  min: 0,
},
professionalFeeDoctor: {
  type: Schema.Types.ObjectId,
  ref: 'Doctor',
},
professionalFeeType: {
  type: String,
  enum: ['consultation', 'procedure', 'reading'],
},
```

**In Invoice Form** (components/InvoiceForm.tsx):
Add PF section after Items section (around line 500):

```tsx
{/* Professional Fee Section */}
<div className="bg-gradient-to-br from-purple-50 to-purple-100/50 border border-purple-200 rounded-xl p-5">
  <div className="flex items-center gap-3 mb-4">
    <div className="p-2 bg-purple-500 rounded-lg">
      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    </div>
    <h3 className="text-lg font
```


## License: unknown
https://github.com/2-fly-4-ai/t3-builds-monorepo-nx/blob/036c626e5cbe9dd8e5726fc67686c9c0e898d8f9/libs/shared/ui/src/tools/aithemegen.tsx

```
Based on the current codebase, here's where and how to properly add **Professional Fees (PF)** to your clinic management system:

## Current Structure Analysis

Your invoice system currently has:
- **Items array** - Services with unitPrice (consultation, procedures, labs, etc.)
- **Discounts** - PWD, Senior, Membership, etc.
- **Tax** - Applied to subtotal
- No dedicated Professional Fee field

## Recommended Implementation: Add PF as Separate Invoice Field

Professional Fees in Philippine medical billing are typically:
1. **Doctor's consultation fee** (separate from facility/clinic fee)
2. **Professional fee for procedures** (surgeon's fee separate from hospital)
3. **Reading fees** (radiologist/pathologist interpretation)

### Implementation Plan:

**Option 1: Add PF as Model Field** (RECOMMENDED for PH medical billing)

```typescript
// models/Invoice.ts - Add these fields:

export interface IInvoice extends Document {
  // ... existing fields ...
  items: IBillingItem[];
  subtotal?: number;
  
  // ADD THESE:
  professionalFee?: number; // Doctor/physician professional fee
  professionalFeeDoctor?: Types.ObjectId; // Which doctor gets the PF
  professionalFeeType?: 'consultation' | 'procedure' | 'reading';
  
  discounts: Array<{...}>;
  tax?: number;
  total?: number;
  // ...
}
```

**Where to add in the model file:**
```typescript
// Around line 34 in models/Invoice.ts, after items and subtotal
professionalFee: {
  type: Number,
  default: 0,
  min: 0,
},
professionalFeeDoctor: {
  type: Schema.Types.ObjectId,
  ref: 'Doctor',
},
professionalFeeType: {
  type: String,
  enum: ['consultation', 'procedure', 'reading'],
},
```

**In Invoice Form** (components/InvoiceForm.tsx):
Add PF section after Items section (around line 500):

```tsx
{/* Professional Fee Section */}
<div className="bg-gradient-to-br from-purple-50 to-purple-100/50 border border-purple-200 rounded-xl p-5">
  <div className="flex items-center gap-3 mb-4">
    <div className="p-2 bg-purple-500 rounded-lg">
      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    </div>
    <h3 className="text-lg font
```

