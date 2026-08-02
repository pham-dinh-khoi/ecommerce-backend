import mongoose, { Document, Schema } from 'mongoose';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

// ==========================================
// ENUMS & TYPES
// ==========================================

export type UserRole = 'admin' | 'seller' | 'user';
export type Gender = 'male' | 'female' | 'other';

// ==========================================
// INTERFACES
// ==========================================

export interface IAvatar {
  url: string;
  publicId: string;
}

export interface IAddress {
  _id?: mongoose.Types.ObjectId;
  label: string; // e.g., "Home", "Work"
  recipientName: string;
  recipientPhone: string;
  province: string;
  district: string;
  ward: string;
  streetAddress: string;
  isDefault: boolean;
}

export interface IUser extends Document {
  name: string;
  email: string;
  password: string;
  role: UserRole;
  avatar?: IAvatar;
  phone?: string;
  gender?: Gender;
  dateOfBirth?: Date;
  addresses: mongoose.Types.DocumentArray<IAddress>;
  isActive: boolean;
  isEmailVerified: boolean;

  // Refresh tokens stored as hashes (Security: never store raw tokens)
  refreshTokens: { token: string; createdAt: Date; userAgent?: string | undefined }[];

  // Password Reset fields
  passwordResetToken?: string | undefined;
  passwordResetExpires?: Date | undefined;
  passwordChangedAt?: Date | undefined; // Used for JWT invalidation

  // Email Verification fields
  emailVerifyToken?: string | undefined;
  emailVerifyExpires?: Date | undefined;

  // Security: Brute-force protection
  loginAttempts: number;
  lockUntil?: Date | undefined;

  createdAt: Date;
  updatedAt: Date;

  // Instance Methods
  comparePassword(candidate: string): Promise<boolean>;
  createPasswordResetToken(): string;
  createEmailVerifyToken(): string;
  isPasswordChangedAfter(jwtTimestamp: number): boolean;
  isLocked(): boolean;
  getDefaultAddress(): IAddress | undefined;
}

// ==========================================
// SUB-SCHEMAS
// ==========================================

const AddressSchema = new Schema<IAddress>(
  {
    label: {
      type: String,
      required: [true, 'Address labels are mandatory'],
      trim: true,
      maxlength: [50, 'Labels should not exceed 50 characters'],
    },
    recipientName: {
      type: String,
      required: [true, 'Recipient name is required'],
      trim: true,
    },
    recipientPhone: {
      type: String,
      required: [true, 'Recipient phone number is required'],
      match: [/^(0|\+84)\d{9,10}$/, 'Invalid phone number'],
    },
    province: { type: String, required: [true, 'Province/city is required'] },
    district: { type: String, required: [true, 'District/county is mandatory'] },
    ward: { type: String, required: [true, 'Ward/commune is mandatory'] },
    streetAddress: {
      type: String,
      required: [true, 'A specific address is required'],
      trim: true,
      maxlength: [200, 'Addresses must not exceed 200 characters'],
    },
    isDefault: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// ==========================================
// MAIN USER SCHEMA
// ==========================================

const UserSchema = new Schema<IUser>(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      maxlength: [100, 'Names must not exceed 100 characters'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Invalid email'],
    },
    password: {
      type: String,
      required: [true, 'A password is required'],
      minlength: [8, 'Password must be at least 8 characters long'],
      select: false, // Security: Do not expose password in queries by default
    },
    role: {
      type: String,
      enum: ['admin', 'seller', 'user'],
      default: 'user',
    },
    avatar: {
      url: String,
      publicId: String,
    },
    phone: {
      type: String,
      match: [/^(0|\+84)\d{9,10}$/, 'Invalid phone number'],
    },
    gender: {
      type: String,
      enum: ['male', 'female', 'other'],
    },
    dateOfBirth: Date,
    addresses: {
      type: [AddressSchema],
      validate: {
        validator: (addrs: IAddress[]) => addrs.length <= 10,
        message: 'You can only save a maximum of 10 addresses',
      },
    },
    isActive: { type: Boolean, default: true },
    isEmailVerified: { type: Boolean, default: false },

    refreshTokens: [
      {
        token: { type: String, required: true }, // Store SHA256 hash
        createdAt: { type: Date, default: Date.now },
        userAgent: String,
      },
    ],

    passwordResetToken: String,
    passwordResetExpires: Date,
    passwordChangedAt: Date,

    emailVerifyToken: String,
    emailVerifyExpires: Date,

    loginAttempts: { type: Number, default: 0 },
    lockUntil: Date,
  },
  {
    timestamps: true,
    toJSON: {
      // Security: Remove sensitive fields from API responses
      transform: (_doc, ret: Record<string, any>) => {
        delete ret.password;
        delete ret.refreshTokens;
        delete ret.passwordResetToken;
        delete ret.passwordResetExpires;
        delete ret.emailVerifyToken;
        delete ret.emailVerifyExpires;
        delete ret.loginAttempts;
        delete ret.lockUntil;
        return ret;
      },
    },
  }
);

// ==========================================
// MIDDLEWARE: Password Hashing
// ==========================================

UserSchema.pre('save', async function () {
  // Only hash password if it was modified (or created)
  if (!this.isModified('password')) return;

  this.password = await bcrypt.hash(this.password, 12);

  // Update passwordChangedAt if modified (invalidates old JWTs)
  if (!this.isNew) {
    this.passwordChangedAt = new Date(Date.now() - 1000); // 1s buffer for race conditions
  }
});

// ==========================================
// MIDDLEWARE: Address Logic
// ==========================================

UserSchema.pre('save', function () {
  if (!this.isModified('addresses')) return;

  const defaultAddrs = this.addresses.filter(a => a.isDefault);

  // Auto-set the first address as default if none exist
  if (defaultAddrs.length === 0 && this.addresses.length > 0) {
    this.addresses[0]!.isDefault = true;
  } 
  // Enforce one-default constraint: keep only the last one defined
  else if (defaultAddrs.length > 1) {
    this.addresses.forEach(a => {
      a.isDefault = false;
    });
    const lastDefault = defaultAddrs[defaultAddrs.length - 1]!;
    const target = this.addresses.id(lastDefault._id);
    if (target) target.isDefault = true;
  }
});

// ==========================================
// INSTANCE METHODS
// ==========================================

UserSchema.methods.comparePassword = async function (candidate: string): Promise<boolean> {
  return bcrypt.compare(candidate, this.password);
};

// Create a reset token (SHA256 for DB storage)
UserSchema.methods.createPasswordResetToken = function (): string {
  const resetToken = crypto.randomBytes(32).toString('hex');
  this.passwordResetToken = crypto.createHash('sha256').update(resetToken).digest('hex');
  this.passwordResetExpires = new Date(Date.now() + 10 * 60 * 1000); // Valid for 10 mins
  return resetToken; 
};

// Create an email verification token
UserSchema.methods.createEmailVerifyToken = function (): string {
  const verifyToken = crypto.randomBytes(32).toString('hex');
  this.emailVerifyToken = crypto.createHash('sha256').update(verifyToken).digest('hex');
  this.emailVerifyExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // Valid for 24 hours
  return verifyToken;
};

// Check if JWT issued before password change (security check)
UserSchema.methods.isPasswordChangedAfter = function (jwtTimestamp: number): boolean {
  if (!this.passwordChangedAt) return false;
  const changedTimestamp = Math.floor(this.passwordChangedAt.getTime() / 1000);
  return jwtTimestamp < changedTimestamp;
};

// Check if account is currently locked (brute-force protection)
UserSchema.methods.isLocked = function (): boolean {
  return !!(this.lockUntil && this.lockUntil > new Date());
};

UserSchema.methods.getDefaultAddress = function (): IAddress | undefined {
  return this.addresses.find((a: IAddress) => a.isDefault);
};

// ==========================================
// INDEXES
// ==========================================

// Token lookup performance
UserSchema.index({ passwordResetToken: 1 }, { sparse: true });
UserSchema.index({ emailVerifyToken: 1 }, { sparse: true });
UserSchema.index({ 'refreshTokens.token': 1 });

// Admin/Filtering/Sorting performance
UserSchema.index({ role: 1, isActive: 1, createdAt: -1 });
UserSchema.index({ createdAt: -1 });

export const User = mongoose.model<IUser>('User', UserSchema);