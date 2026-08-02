import mongoose, { Document, Schema } from 'mongoose';

// Sub-interfaces

export interface ICartItem {
  _id?: mongoose.Types.ObjectId;
  product: mongoose.Types.ObjectId;
  variant: mongoose.Types.ObjectId; // bắt buộc chọn variant cụ thể
  sku: string; // snapshot khi thêm — tránh phải lookup lại
  name: string; // snapshot tên sản phẩm
  image?: string; // snapshot ảnh đại diện
  price: number; // snapshot giá tại thời điểm thêm
  quantity: number;
  stock: number; // snapshot tồn kho — check trước khi checkout
  addedAt: Date;
}

export interface ICart extends Document {
  user: mongoose.Types.ObjectId;
  items: ICartItem[];
  // Các field tổng hợp — tự tính trong pre-save
  totalItems: number; // tổng số lượng sản phẩm
  totalAmount: number; // tổng tiền
  updatedAt: Date;
  createdAt: Date;
}

// Schema

const CartItemSchema = new Schema<ICartItem>(
  {
    product: {
      type: Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    variant: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    sku: { type: String, required: true },
    name: { type: String, required: true },
    image: String,
    price: { type: Number, required: true, min: 0 },
    quantity: {
      type: Number,
      required: true,
      min: [1, 'Số lượng ít nhất là 1'],
      max: [100, 'Số lượng tối đa là 100'],
    },
    stock: { type: Number, required: true, min: 0 },
    addedAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const CartSchema = new Schema<ICart>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true, // Mỗi user chỉ có đúng 1 cart document
    },
    items: {
      type: [CartItemSchema],
      validate: {
        validator: (items: ICartItem[]) => items.length <= 50,
        message: 'Giỏ hàng tối đa 50 sản phẩm',
      },
    },
    totalItems: { type: Number, default: 0 },
    totalAmount: { type: Number, default: 0 },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
  }
);

// Tự tính totalItems + totalAmount trước khi save

CartSchema.pre('save', async function () {
  if (this.isModified('items')) {
    this.totalItems = this.items.reduce((sum, item) => sum + item.quantity, 0);
    this.totalAmount = this.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  }
});

// CartSchema.index({ user: 1 });

export const Cart = mongoose.model<ICart>('Cart', CartSchema);
