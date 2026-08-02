import mongoose, { Document, Schema } from 'mongoose';

// ==========================================
// INTERFACES
// ==========================================

export interface IWishlistItem {
  _id?: mongoose.Types.ObjectId;
  product: mongoose.Types.ObjectId; // Reference to the Product
  addedAt: Date; // Timestamp when the product was added
}

export interface IWishlist extends Document {
  user: mongoose.Types.ObjectId; // Owner of the wishlist
  items: IWishlistItem[]; // List of products in the wishlist
  createdAt: Date;
  updatedAt: Date;
}

// ==========================================
// SUB-SCHEMAS
// ==========================================

const WishlistItemSchema = new Schema<IWishlistItem>(
  {
    product: {
      type: Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    addedAt: { type: Date, default: Date.now },
  },
  { _id: true } // Each item has its own unique ID within the array
);

// ==========================================
// MAIN WISHLIST SCHEMA
// ==========================================

const WishlistSchema = new Schema<IWishlist>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true, // Ensures one wishlist per user
    },
    items: {
      type: [WishlistItemSchema],
      validate: {
        // Business logic: cap wishlist size at 200 items
        validator: (items: IWishlistItem[]) => items.length <= 200,
        message: 'Wishlist cannot exceed 200 items',
      },
    },
  },
  { timestamps: true }
);

// ==========================================
// INDEXES
// ==========================================

// Compound index to verify if a product exists in a specific user's wishlist
// This significantly improves the performance of "check if bookmarked" queries
WishlistSchema.index({ user: 1, 'items.product': 1 });

export const Wishlist = mongoose.model<IWishlist>('Wishlist', WishlistSchema);