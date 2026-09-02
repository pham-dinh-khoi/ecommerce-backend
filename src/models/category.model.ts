import mongoose, { Document, Schema } from 'mongoose';
import slugify from 'slugify';

// Define the interface for CategoryImage documents
export interface ICategoryImage {
  url: string;
  publicId: string;
}

// Define the interface for Category documents
export interface ICategory extends Document {
  name: string;
  slug: string;
  description?: string;
  image?: ICategoryImage;
  parent?: mongoose.Types.ObjectId; // Reference to the immediate parent
  ancestors: Array<{ _id: mongoose.Types.ObjectId; name: string; slug: string }>; // Materialized path
  level: number; // Depth in the tree
  isActive: boolean; // Toggle visibility
  sortOrder: number; // Order for display
  createdAt: Date;
  updatedAt: Date;
}

const CategorySchema = new Schema<ICategory>(
  {
    name: {
      type: String,
      required: [true, 'The category name is required.'],
      trim: true,
      maxlength: [100, 'Category name must not exceed 100 characters'],
    },
    slug: {
      type: String,
      unique: true,
      lowercase: true,
    },
    description: {
      type: String,
      maxlength: [500, 'Description of no more than 500 characters'],
    },
    image: {
      url: String,
      publicId: String,
    },
    parent: {
      type: Schema.Types.ObjectId,
      ref: 'Category',
      default: null, // If null, this is a root category
    },
    ancestors: [
      {
        _id: { type: Schema.Types.ObjectId, ref: 'Category' },
        name: String,
        slug: String,
      },
    ],
    level: {
      type: Number,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    sortOrder: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Virtual field to populate direct children of the category
CategorySchema.virtual('children', {
  ref: 'Category',
  localField: '_id',
  foreignField: 'parent',
});

// Middleware: Logic executed before saving a category document
CategorySchema.pre('save', async function () {
  try {
    // 1. Slug processing logic: ensures the slug is unique and URL-friendly
    if (this.isModified('name')) {
      const baseSlug = slugify(this.name, { lower: true, locale: 'vi' });
      let slug = baseSlug;
      let count = 0;

      // Iterate to append suffix if the slug already exists (avoid collisions)
      while (await mongoose.model('Category').findOne({ slug, _id: { $ne: this._id } })) {
        count++;
        slug = `${baseSlug}-${count}`;
      }
      this.slug = slug;
    }

    // 2. Logic for calculating ancestors from a parent: maintains the tree path
    if (this.isModified('parent') && this.parent) {
      const parent = await mongoose.model<ICategory>('Category').findById(this.parent);
      if (parent) {
        // Inherit parent's ancestors and add the parent itself to the path
        this.ancestors = [
          ...parent.ancestors,
          { _id: parent._id, name: parent.name, slug: parent.slug },
        ];
        // Level is determined by the length of the ancestor path
        this.level = this.ancestors.length;
      }
    } else if (!this.parent) {
      // If no parent is set, reset to root level
      this.ancestors = [];
      this.level = 0;
    }
  } catch (error) {
    // Log error to console and re-throw to block save operation on failure
    console.error('Error processing Category pre-save:', error);
    throw error;
  }
});

// Indexes for query performance optimization
// CategorySchema.index({ slug: 1 }); // Slug is already unique (auto-indexed)
CategorySchema.index({ parent: 1 });
CategorySchema.index({ isActive: 1 });

export const Category = mongoose.model<ICategory>('Category', CategorySchema);
