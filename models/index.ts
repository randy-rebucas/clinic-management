/**
 * MyClinicSoft - Models Index
 * 
 * This file exports all Mongoose models in the correct order to ensure
 * proper model registration and avoid circular dependency issues.
 * 
 * Model Registration Order:
 * 1. Base/Reference models (no dependencies)
 * 2. Role and Permission models
 * 3. Profile models (Admin, Doctor, Nurse, etc.)
 * 4. User model (references all profile models)
 * 5. Core clinical models (Patient, etc.)
 * 6. Transactional models (Appointment, Visit, etc.)
 * 7. Supporting models (Queue, Notification, etc.)
 * 
 * Relationships Overview:
 * ──────────────────────────────────────────────────────────────────
 * 
 * AUTHENTICATION & AUTHORIZATION:
 * ├── User → Role (many-to-one)
 * ├── User → Permission[] (one-to-many)
 * ├── User → [Admin|Doctor|Nurse|Receptionist|Accountant|MedicalRep] (one-to-one)
 * └── Role → Permission[] (many-to-many)
 * 
 * STAFF PROFILES (auto-create User on save):
 * ├── Admin → User
 * ├── Doctor → User
 * ├── Nurse → User
 * ├── Receptionist → User
 * ├── Accountant → User
 * ├── MedicalRepresentative → User
 * └── Staff → User (legacy)
 * 
 * PATIENT CARE:
 * ├── Patient (core entity)
 * ├── Appointment → Patient, Doctor, User
 * ├── Visit → Patient, User, Prescription[], LabResult[], Imaging[], Procedure[]
 * ├── Prescription → Patient, Visit, User, Medicine
 * ├── LabResult → Patient, Visit, User
 * ├── Imaging → Patient, Visit, User
 * └── Procedure → Patient, Visit, User
 * 
 * QUEUE MANAGEMENT:
 * └── Queue → Patient, Appointment, Visit, Doctor, Room
 * 
 * BILLING:
 * ├── Invoice → Patient, Visit, Service, User
 * └── Membership → Patient (referredBy, referrals)
 * 
 * REFERRALS:
 * └── Referral → Doctor, Patient, Visit, Appointment, User
 * 
 * DOCUMENTS:
 * ├── Document → Patient, Visit, Appointment, LabResult, Invoice, User
 * └── Attachment (embedded subdocument)
 * 
 * CATALOG/REFERENCE:
 * ├── Medicine
 * ├── Service
 * ├── Room
 * ├── Specialization
 * └── Settings (singleton)
 * 
 * AUDIT & NOTIFICATIONS:
 * ├── AuditLog → User, Patient
 * └── Notification → User
 * 
 * INVENTORY:
 * └── InventoryItem → Medicine, User
 * 
 * ──────────────────────────────────────────────────────────────────
 */

// ============================================================
// 1. BASE/REFERENCE MODELS (No dependencies)
// ============================================================
export { default as Attachment, AttachmentSchema } from './Attachment';
export type { IAttachment } from './Attachment';

export { default as Tenant } from './Tenant';
export type { ITenant } from './Tenant';

export { default as Medicine } from './Medicine';
export type { IMedicine, IDosageRange } from './Medicine';

export { default as Product } from './Product';
export type { IProduct } from './Product';

export { default as Service } from './Service';
export type { IService } from './Service';

export { default as Room } from './Room';
export type { IRoom } from './Room';

export { default as Specialization } from './Specialization';
export type { ISpecialization } from './Specialization';

export { default as Settings } from './Settings';
export type { ISettings, IBusinessHours } from './Settings';

// ============================================================
// 2. ROLE AND PERMISSION MODELS
// ============================================================
export { default as Role } from './Role';
export type { IRole, RoleName } from './Role';

export { default as Permission } from './Permission';
export type { IPermission } from './Permission';

// ============================================================
// 3. STAFF PROFILE MODELS (These auto-create User records)
// ============================================================
export { default as Admin } from './Admin';
export type { IAdmin } from './Admin';

export { default as Doctor } from './Doctor';
export type { IDoctor } from './Doctor';

export { default as Nurse } from './Nurse';
export type { INurse } from './Nurse';

export { default as Receptionist } from './Receptionist';
export type { IReceptionist } from './Receptionist';

export { default as Accountant } from './Accountant';
export type { IAccountant } from './Accountant';

export { default as MedicalRepresentative } from './MedicalRepresentative';
export type { IMedicalRepresentative } from './MedicalRepresentative';

export { default as Staff } from './Staff';
export type { IStaff } from './Staff';

// ============================================================
// 4. USER MODEL (References profile models)
// ============================================================
export { default as User } from './User';
export type { IUser } from './User';

// ============================================================
// 5. CORE CLINICAL MODELS
// ============================================================
export { default as Patient } from './Patient';
export type { IPatient } from './Patient';

// ============================================================
// 6. TRANSACTIONAL MODELS
// ============================================================
export { default as Appointment } from './Appointment';
export type { IAppointment } from './Appointment';

export { default as Visit } from './Visit';
export type { 
  IVisit, 
  IVital, 
  IPhysicalExam, 
  ISOAPNotes, 
  ITreatmentPlan, 
  IDigitalSignature 
} from './Visit';

export { default as MedicalRepresentativeVisit } from './MedicalRepresentativeVisit';
export type { IMedicalRepresentativeVisit } from './MedicalRepresentativeVisit';

export { default as Prescription } from './Prescription';
export type { IPrescription, IMedication, IPharmacyDispense } from './Prescription';

export { default as LabResult } from './LabResult';
export type { ILabResult, ILabRequest, IThirdPartyLab } from './LabResult';

export { default as Imaging } from './Imaging';
export type { IImaging } from './Imaging';

export { default as Procedure } from './Procedure';
export type { IProcedure } from './Procedure';

export { default as Invoice } from './Invoice';
export type { IInvoice, IBillingItem } from './Invoice';

export { default as Referral } from './Referral';
export type { IReferral, ReferralStatus, ReferralType } from './Referral';

// ============================================================
// 7. SUPPORTING MODELS
// ============================================================
export { default as Queue } from './Queue';
export type { IQueue, QueueStatus, QueueType } from './Queue';

export { default as Document } from './Document';
export type { IDocument, DocumentCategory, DocumentType } from './Document';

export { default as Membership } from './Membership';
export type { IMembership, MembershipTier, MembershipStatus } from './Membership';

export { default as InventoryItem } from './Inventory';
export type { IInventoryItem } from './Inventory';

export { default as SupportRequest } from './SupportRequest';
export type { ISupportRequest, SupportCategory, SupportStatus } from './SupportRequest';

// ============================================================
// 8. AUDIT AND NOTIFICATION MODELS
// ============================================================
export { default as AuditLog } from './AuditLog';
export type { IAuditLog, AuditAction, AuditResource } from './AuditLog';

export { default as Notification } from './Notification';
export type { INotification, NotificationType, NotificationPriority } from './Notification';

// ============================================================
// MODEL REGISTRATION HELPER
// ============================================================
/**
 * Ensures all models are registered with Mongoose.
 * Call this function during application initialization.
 * 
 * @example
 * import { registerAllModels } from '@/models';
 * await connectToDatabase();
 * registerAllModels();
 */
export function registerAllModels(): void {
  // Import all models to trigger registration
  // The order matters due to references between models
  // Using require() for dynamic model loading is intentional
  
  // Base models
   
  require('./Attachment');
   
  require('./Tenant');
   
  require('./Medicine');
   
  require('./Service');
   
  require('./Room');
   
  require('./Specialization');
   
  require('./Settings');
  
  // Auth models
   
  require('./Role');
   
  require('./Permission');
  
  // Profile models
   
  require('./Admin');
   
  require('./Doctor');
   
  require('./Nurse');
   
  require('./Receptionist');
   
  require('./Accountant');
   
  require('./MedicalRepresentative');
   
  require('./Staff');
  
  // User model
   
  require('./User');
  
  // Clinical models
   
  require('./Patient');
   
  require('./Appointment');
   
  require('./Visit');
   
  require('./Prescription');
   
  require('./LabResult');
   
  require('./Imaging');
   
  require('./Procedure');
   
  require('./Invoice');
   
  require('./Referral');
  
  // Supporting models
   
  require('./Queue');
   
  require('./Document');
   
  require('./Membership');
   
  require('./Inventory');
  
  // Audit models
   
  require('./AuditLog');
   
  require('./Notification');
  
  console.log('✅ All models registered successfully');
}

// ============================================================
// DEFAULT EXPORT
// ============================================================
const models = {
  // Base/Reference
  Attachment: require('./Attachment').default,
  Tenant: require('./Tenant').default,
  Medicine: require('./Medicine').default,
  Service: require('./Service').default,
  Room: require('./Room').default,
  Specialization: require('./Specialization').default,
  Settings: require('./Settings').default,
  
  // Auth
  Role: require('./Role').default,
  Permission: require('./Permission').default,
  
  // Profiles
  Admin: require('./Admin').default,
  Doctor: require('./Doctor').default,
  Nurse: require('./Nurse').default,
  Receptionist: require('./Receptionist').default,
  Accountant: require('./Accountant').default,
  MedicalRepresentative: require('./MedicalRepresentative').default,
  Staff: require('./Staff').default,
  
  // User
  User: require('./User').default,
  
  // Clinical
  Patient: require('./Patient').default,
  Appointment: require('./Appointment').default,
  Visit: require('./Visit').default,
  Prescription: require('./Prescription').default,
  LabResult: require('./LabResult').default,
  Imaging: require('./Imaging').default,
  Procedure: require('./Procedure').default,
  Invoice: require('./Invoice').default,
  Referral: require('./Referral').default,
  
  // Supporting
  Queue: require('./Queue').default,
  Document: require('./Document').default,
  Membership: require('./Membership').default,
  InventoryItem: require('./Inventory').default,
  
  // Audit
  AuditLog: require('./AuditLog').default,
  Notification: require('./Notification').default,
};

export default models;

