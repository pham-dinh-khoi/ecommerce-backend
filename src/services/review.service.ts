import mongoose from 'mongoose';
import { Review, type IReview, type ReviewStatus } from '../models/review.model.js';
import { Product } from '../models/product.model.js';
import { Order } from '../models/order.model.js';
import { uploadImages, deleteImages } from './cloudinary.service.js';
import { autoModerate } from './moderation.service.js';
import { AppError } from '../utils/AppError.js';
import type { PaginationResult } from '../@types/product.types.js';
import type {
  CreateReviewInput,
  UpdateReviewInput,
  ModerateReviewInput,
  ReplyReviewInput,
  ReviewQueryInput,
  AdminReviewQueryInput,
} from '../validations/review.validation.js';

// ==========================================
// REVIEW OPERATIONS
// ==========================================

/**
 * Creates a new product review with automatic moderation.
 * Verifies if the user has purchased the product before allowing the review.
 */
export const createReview = async (
  input: CreateReviewInput,
  userId: string,
  imageFiles: Express.Multer.File[]
): Promise<IReview> => {
  const product = await Product.findById(input.productId);
  if (!product || product.status !== 'active') {
    throw new AppError('Product not found or unavailable', 404);
  }

  // Check for verified purchase status
  const verifiedOrder = await Order.findOne({
    user: userId,
    status: 'delivered',
    'items.product': new mongoose.Types.ObjectId(input.productId),
  }).select('_id');

  const isVerifiedPurchase = !!verifiedOrder;

  // Run auto-moderation
  const modResult = await autoModerate(
    userId,
    input.productId,
    input.title,
    input.content,
    isVerifiedPurchase
  );

  if (modResult.decision === 'reject') {
    if (modResult.flags.includes('duplicate_review')) {
      throw new AppError('You have already reviewed this product', 400);
    }
    throw new AppError('Review rejected: ' + modResult.flags.join(', '), 400);
  }

  // Upload review images
  let images: IReview['images'] = [];
  if (imageFiles.length > 0) {
    const uploaded = await uploadImages(imageFiles, 'reviews');
    images = uploaded.map(r => ({ url: r.secure_url, publicId: r.public_id }));
  }

  const review = await Review.create({
    product: input.productId,
    user: userId,
    ...(verifiedOrder?._id && { order: verifiedOrder._id }),
    rating: input.rating,
    title: input.title,
    content: input.content,
    images,
    isVerifiedPurchase,
    moderation: {
      status: modResult.decision === 'approve' ? 'approved' : 'pending',
      autoFlags: modResult.flags,
    },
  });

  // Update product ratings if approved immediately
  if (modResult.decision === 'approve') {
    await recalculateProductRating(input.productId);
  }

  return review.populate('user', 'name avatar');
};

/**
 * Retrieves paginated, approved reviews for a specific product.
 */
export const getProductReviews = async (
  productId: string,
  query: ReviewQueryInput,
  userId?: string
): Promise<{
  reviews: IReview[];
  pagination: PaginationResult;
  summary: { average: number; count: number; distribution: Record<string, number> };
}> => {
  const filter: mongoose.QueryFilter<IReview> = {
    product: productId,
    'moderation.status': 'approved',
  };

  if (query.rating) filter.rating = query.rating;
  if (query.verified === true) filter.isVerifiedPurchase = true;
  if (query.withImages === true) filter['images.0'] = { $exists: true };

  const sortMap: Record<string, Record<string, 1 | -1>> = {
    newest: { createdAt: -1 },
    oldest: { createdAt: 1 },
    highest: { rating: -1, helpfulCount: -1 },
    lowest: { rating: 1, helpfulCount: -1 },
    helpful: { helpfulCount: -1, createdAt: -1 },
    verified: { isVerifiedPurchase: -1, helpfulCount: -1 },
  };
  const sort = sortMap[query.sort] || { createdAt: -1 };

  const skip = (query.page - 1) * query.limit;

  const [reviews, total] = await Promise.all([
    Review.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(query.limit)
      .populate('user', 'name avatar')
      .populate('sellerReply.repliedBy', 'name')
      .lean(),
    Review.countDocuments(filter),
  ]);

  const totalPages = Math.ceil(total / query.limit);

  const product = await Product.findById(productId).select('rating').lean();
  const summary = {
    average: product?.rating.average || 0,
    count: product?.rating.count || 0,
    distribution: product?.rating.distribution || { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
  };

  const reviewsWithVoteStatus = reviews.map((r: any) => {
    const isVotedByMe = userId
      ? (r.helpfulVotes?.some((v: any) => v.user.toString() === userId) ?? false)
      : false;
    const rest = { ...r };
    delete rest.helpfulVotes;

    return { ...rest, isVotedByMe };
  });

  return {
    reviews: reviewsWithVoteStatus as unknown as IReview[],
    pagination: {
      total,
      page: query.page,
      limit: query.limit,
      totalPages,
      hasNext: query.page < totalPages,
      hasPrev: query.page > 1,
    },
    summary,
  };
};

/**
 * Retrieves the authenticated user's own reviews.
 */
export const getMyReviews = async (
  userId: string,
  page: number,
  limit: number
): Promise<{ reviews: IReview[]; pagination: PaginationResult }> => {
  const skip = (page - 1) * limit;
  const [reviews, total] = await Promise.all([
    Review.find({ user: userId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('product', 'name slug images')
      .lean(),
    Review.countDocuments({ user: userId }),
  ]);

  const totalPages = Math.ceil(total / limit);
  return {
    reviews: reviews as unknown as IReview[],
    pagination: { total, page, limit, totalPages, hasNext: page < totalPages, hasPrev: page > 1 },
  };
};

/**
 * Updates a user's review. Only allowed within 24 hours of creation.
 */
export const updateReview = async (
  reviewId: string,
  userId: string,
  input: UpdateReviewInput,
  imageFiles: Express.Multer.File[]
): Promise<IReview> => {
  const review = await Review.findOne({ _id: reviewId, user: userId });
  if (!review) throw new AppError('Review not found', 404);

  const hoursSinceCreated = (Date.now() - review.createdAt.getTime()) / 3_600_000;
  if (hoursSinceCreated > 24) {
    throw new AppError('Reviews can only be edited within 24 hours', 400);
  }

  const wasApproved = review.moderation.status === 'approved';

  if (input.rating) review.rating = input.rating;
  if (input.title) review.title = input.title;
  if (input.content) review.content = input.content;
  review.isEdited = true;
  review.editedAt = new Date();

  if (imageFiles.length > 0) {
    const oldPublicIds = review.images.map(img => img.publicId).filter(Boolean);
    if (oldPublicIds.length) await deleteImages(oldPublicIds).catch(() => {});

    const uploaded = await uploadImages(imageFiles, 'reviews');
    review.images = uploaded.map(r => ({ url: r.secure_url, publicId: r.public_id }));
  }

  // Reset to pending for re-moderation if content changes
  if (input.content || input.title) {
    review.moderation.status = 'pending';
  }

  await review.save();

  if (wasApproved && review.moderation.status === 'pending') {
    await recalculateProductRating(review.product.toString());
  }

  return review;
};

/**
 * Removes a review and updates product ratings accordingly.
 */
export const deleteReview = async (
  reviewId: string,
  userId: string,
  isAdmin = false
): Promise<void> => {
  const filter = isAdmin ? { _id: reviewId } : { _id: reviewId, user: userId };
  const review = await Review.findOne(filter);
  if (!review) throw new AppError('Review not found', 404);

  const wasApproved = review.moderation.status === 'approved';
  const productId = review.product.toString();

  const publicIds = review.images.map(img => img.publicId).filter(Boolean);
  if (publicIds.length) await deleteImages(publicIds).catch(() => {});

  await review.deleteOne();

  if (wasApproved) {
    await recalculateProductRating(productId);
  }
};

// ==========================================
// MODERATION & ADMIN
// ==========================================

export const moderateReview = async (
  reviewId: string,
  adminId: string,
  input: ModerateReviewInput
): Promise<IReview> => {
  const review = await Review.findById(reviewId);
  if (!review) throw new AppError('Review not found', 404);

  const previousStatus = review.moderation.status;

  review.moderation.status = input.status as ReviewStatus;
  review.moderation.moderatedBy = new mongoose.Types.ObjectId(adminId);
  review.moderation.moderatedAt = new Date();
  if (input.reason) review.moderation.reason = input.reason;

  await review.save();

  const statusChanged =
    (previousStatus === 'approved' && input.status !== 'approved') ||
    (previousStatus !== 'approved' && input.status === 'approved');

  if (statusChanged) {
    await recalculateProductRating(review.product.toString());
  }

  return review.populate('user', 'name avatar');
};

export const getAdminReviews = async (
  query: AdminReviewQueryInput
): Promise<{ reviews: IReview[]; pagination: PaginationResult }> => {
  const { page, limit, status, productId, userId, rating, sort, order } = query;
  const filter: mongoose.QueryFilter<IReview> = {};
  if (status) filter['moderation.status'] = status;
  if (productId) filter.product = productId;
  if (userId) filter.user = userId;
  if (rating) filter.rating = rating;

  const skip = (page - 1) * limit;
  const sortOpt: Record<string, 1 | -1> = { [sort]: order === 'asc' ? 1 : -1 };

  const [reviews, total] = await Promise.all([
    Review.find(filter)
      .sort(sortOpt)
      .skip(skip)
      .limit(limit)
      .populate('user', 'name email avatar')
      .populate('product', 'name slug')
      .lean(),
    Review.countDocuments(filter),
  ]);

  const totalPages = Math.ceil(total / limit);
  return {
    reviews: reviews as unknown as IReview[],
    pagination: { total, page, limit, totalPages, hasNext: page < totalPages, hasPrev: page > 1 },
  };
};

export const replyReview = async (
  reviewId: string,
  adminOrSellerId: string,
  input: ReplyReviewInput
): Promise<IReview> => {
  const review = await Review.findById(reviewId);
  if (!review) throw new AppError('Review not found', 404);
  if (review.moderation.status !== 'approved') {
    throw new AppError('Only approved reviews can be replied to', 400);
  }
  if (review.sellerReply) {
    throw new AppError('This review already has a reply', 400);
  }

  review.sellerReply = {
    content: input.content,
    repliedBy: new mongoose.Types.ObjectId(adminOrSellerId),
    repliedAt: new Date(),
  };

  await review.save();
  return review.populate('sellerReply.repliedBy', 'name');
};

// ==========================================
// USER INTERACTIONS
// ==========================================

export const voteHelpful = async (
  reviewId: string,
  userId: string,
  isHelpful: boolean
): Promise<{ helpfulCount: number; notHelpfulCount: number; userVote: boolean | null }> => {
  const review = await Review.findById(reviewId);
  if (!review) throw new AppError('Review not found', 404);
  if (review.moderation.status !== 'approved') {
    throw new AppError('Cannot vote on this review', 400);
  }
  if (review.user.toString() === userId) {
    throw new AppError('Cannot vote on your own review', 400);
  }

  const existingVoteIdx = review.helpfulVotes.findIndex(v => v.user.toString() === userId);

  // Toggle: Remove vote if it exists
  if (existingVoteIdx >= 0) {
    review.helpfulVotes.splice(existingVoteIdx, 1);
    if (isHelpful) review.helpfulCount = Math.max(0, review.helpfulCount - 1);
    else review.notHelpfulCount = Math.max(0, review.notHelpfulCount - 1);

    await review.save();
    return {
      helpfulCount: review.helpfulCount,
      notHelpfulCount: review.notHelpfulCount,
      userVote: null,
    };
  }

  // Add new vote
  review.helpfulVotes.push({ user: new mongoose.Types.ObjectId(userId), votedAt: new Date() });
  if (isHelpful) review.helpfulCount += 1;
  else review.notHelpfulCount += 1;

  await review.save();
  return {
    helpfulCount: review.helpfulCount,
    notHelpfulCount: review.notHelpfulCount,
    userVote: isHelpful,
  };
};

// ==========================================
// AGGREGATION HELPERS
// ==========================================

/**
 * Aggregates approved review data and updates the product's cached rating fields.
 */
export const recalculateProductRating = async (productId: string): Promise<void> => {
  const [result] = await Review.aggregate([
    {
      $match: {
        product: new mongoose.Types.ObjectId(productId),
        'moderation.status': 'approved',
      },
    },
    {
      $group: {
        _id: null,
        average: { $avg: '$rating' },
        count: { $sum: 1 },
        star1: { $sum: { $cond: [{ $eq: ['$rating', 1] }, 1, 0] } },
        star2: { $sum: { $cond: [{ $eq: ['$rating', 2] }, 1, 0] } },
        star3: { $sum: { $cond: [{ $eq: ['$rating', 3] }, 1, 0] } },
        star4: { $sum: { $cond: [{ $eq: ['$rating', 4] }, 1, 0] } },
        star5: { $sum: { $cond: [{ $eq: ['$rating', 5] }, 1, 0] } },
      },
    },
  ]);

  if (!result) {
    // Reset if no reviews left
    await Product.findByIdAndUpdate(productId, {
      $set: {
        'rating.average': 0,
        'rating.count': 0,
        'rating.distribution': { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      },
    });
    return;
  }

  await Product.findByIdAndUpdate(productId, {
    $set: {
      'rating.average': Math.round(result.average * 10) / 10,
      'rating.count': result.count,
      'rating.distribution': {
        1: result.star1,
        2: result.star2,
        3: result.star3,
        4: result.star4,
        5: result.star5,
      },
    },
  });
};
