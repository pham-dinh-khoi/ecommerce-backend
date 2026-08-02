import mongoose, { Document, Schema } from 'mongoose';
import slugify from 'slugify';

// ==========================================
// INTERFACES
// ==========================================

export interface IProductImage {
  url: string;
  publicId: string;
  alt?: string;
  isPrimary: boolean;
  sortOrder: number;
}

export interface IVariantAttribute {
  name: string; // e.g., "Color", "Size"
  value: string; // e.g., "Red", "XL"
}

export interface IProductVariant {
  _id?: mongoose.Types.ObjectId;
  sku: string;
  attributes: IVariantAttribute[];
  price: number;
  comparePrice?: number; // Original price before discount
  stock: number;
  images: IProductImage[];
  isActive: boolean;
  weight?: number; // In grams
  barcode?: string;
}

export interface IProduct extends Document {
  name: string;
  slug: string;
  description: string;
  shortDescription?: string;
  category: mongoose.Types.ObjectId;
  brand?: string;
  tags: string[];
  images: IProductImage[];
  variants: IProductVariant[];
  // Aggregated data: Calculated automatically
  minPrice: number;
  maxPrice: number;
  totalStock: number;
  // SEO
  metaTitle?: string;
  metaDescription?: string;
  // Stats
  rating: {
    average: number;
    count: number;
    distribution: { 1: number; 2: number; 3: number; 4: number; 5: number };
  };
  soldCount: number;
  viewCount: number;
  // Status
  status: 'draft' | 'active' | 'inactive' | 'archived';
  isFeatured: boolean;
  createdBy: mongoose.Types.ObjectId;
  updatedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

// ==========================================
// SUB-SCHEMAS
// ==========================================

const ProductImageSchema = new Schema<IProductImage>(
  {
    url: { type: String, required: true },
    publicId: { type: String, required: true },
    alt: String,
    isPrimary: { type: Boolean, default: false },
    sortOrder: { type: Number, default: 0 },
  },
  { _id: false }
);

const VariantAttributeSchema = new Schema<IVariantAttribute>(
  {
    name: { type: String, required: true },
    value: { type: String, required: true },
  },
  { _id: false }
);

const ProductVariantSchema = new Schema<IProductVariant>({
  sku: {
    type: String,
    required: [true, 'SKU is required'],
    trim: true,
    uppercase: true,
  },
  attributes: [VariantAttributeSchema],
  price: {
    type: Number,
    required: [true, 'Price is required'],
    min: [0, 'Price cannot be negative'],
  },
  comparePrice: {
    type: Number,
    min: [0, 'comparePrice cannot be negative'],
    validate: {
      validator: function (this: IProductVariant, v: number) {
        return !v || v > this.price;
      },
      message: 'comparePrice must be greater than price',
    },
  },
  stock: {
    type: Number,
    required: true,
    min: [0, 'Stock cannot be negative'],
    default: 0,
  },
  images: [ProductImageSchema],
  isActive: { type: Boolean, default: true },
  weight: { type: Number, min: 0 },
  barcode: { type: String, trim: true },
});

// ==========================================
// MAIN PRODUCT SCHEMA
// ==========================================

const ProductSchema = new Schema<IProduct>(
  {
    name: {
      type: String,
      required: [true, 'Product name is required'],
      trim: true,
      maxlength: [200, 'Product name must not exceed 200 characters'],
    },
    slug: {
      type: String,
      unique: true,
      lowercase: true,
    },
    description: {
      type: String,
      required: [true, 'Product description is required'],
    },
    shortDescription: {
      type: String,
      maxlength: [300, 'Short description must not exceed 300 characters'],
    },
    category: {
      type: Schema.Types.ObjectId,
      ref: 'Category',
      required: [true, 'Category is required'],
    },
    brand: { type: String, trim: true },
    tags: [{ type: String, trim: true, lowercase: true }],
    images: [ProductImageSchema],
    variants: {
      type: [ProductVariantSchema],
    },
    // Aggregated Fields
    minPrice: { type: Number, default: 0 },
    maxPrice: { type: Number, default: 0 },
    totalStock: { type: Number, default: 0 },
    // SEO
    metaTitle: { type: String, maxlength: 70 },
    metaDescription: { type: String, maxlength: 160 },
    // Stats
    rating: {
      average: { type: Number, default: 0, min: 0, max: 5 },
      count: { type: Number, default: 0 },
      distribution: {
        1: { type: Number, default: 0 },
        2: { type: Number, default: 0 },
        3: { type: Number, default: 0 },
        4: { type: Number, default: 0 },
        5: { type: Number, default: 0 },
      },
    },
    soldCount: { type: Number, default: 0 },
    viewCount: { type: Number, default: 0 },
    // Status
    status: {
      type: String,
      enum: ['draft', 'active', 'inactive', 'archived'],
      default: 'draft',
    },
    isFeatured: { type: Boolean, default: false },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ==========================================
// MIDDLEWARE: Pre-save Hooks
// ==========================================

ProductSchema.pre('save', async function () {
  try {
    // 1. Slug Processing
    if (this.isModified('name')) {
      const baseSlug = slugify(this.name, { lower: true, locale: 'vi' });
      let slug = baseSlug;
      let count = 0;

      const ProductModel = mongoose.model<IProduct>('Product');
      // Ensure unique slug
      while (await ProductModel.findOne({ slug, _id: { $ne: this._id } })) {
        count++;
        slug = `${baseSlug}-${count}`;
      }
      this.slug = slug;
    }

    // 2. Pricing and Inventory Logic (from active variants)
    if (this.isModified('variants')) {
      const activeVariants = this.variants.filter((v) => v.isActive);

      if (activeVariants.length > 0) {
        const prices = activeVariants.map((v) => v.price);
        this.minPrice = Math.min(...prices);
        this.maxPrice = Math.max(...prices);
        this.totalStock = activeVariants.reduce((sum, v) => sum + v.stock, 0);
      } else {
        this.minPrice = 0;
        this.maxPrice = 0;
        this.totalStock = 0;
      }

      // Ensure all SKUs are unique within the product
      const skus = this.variants.map((v) => v.sku);
      if (new Set(skus).size !== skus.length) {
        throw new Error('Product variants must have unique SKUs');
      }
    }
  } catch (error) {
    console.error('Error in Product pre-save middleware:', error);
    throw error; // Propagate error to halt the save process
  }
});

// ==========================================
// INDEXES
// ==========================================

// Single Field Indexes
ProductSchema.index({ 'rating.average': -1 });
ProductSchema.index({ tags: 1 });
ProductSchema.index({ brand: 1 });
ProductSchema.index({ soldCount: -1 });
ProductSchema.index({ createdAt: -1 });

// Compound Indexes for Filtering
ProductSchema.index({ status: 1, minPrice: 1 });
ProductSchema.index({ status: 1, 'rating.average': -1 });
ProductSchema.index({ status: 1, soldCount: -1 });
ProductSchema.index({ status: 1, createdAt: -1 });
ProductSchema.index({ status: 1, isFeatured: 1, soldCount: -1 });
ProductSchema.index({ category: 1, status: 1, minPrice: 1 });
ProductSchema.index({ category: 1, status: 1, soldCount: -1 });
ProductSchema.index({ brand: 1, status: 1 });
ProductSchema.index({ status: 1, totalStock: 1 });

// Full-Text Search Index
ProductSchema.index(
  { name: 'text', brand: 'text', tags: 'text', description: 'text' },
  {
    weights: { name: 10, brand: 5, tags: 3, description: 1 },
    name: 'product_text_search',
  }
);

export const Product = mongoose.model<IProduct>('Product', ProductSchema);