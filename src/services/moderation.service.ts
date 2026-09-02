import { Review } from '../models/review.model.js';

// ==========================================
// INTERFACES & TYPES
// ==========================================

export interface ModerationResult {
  decision: 'approve' | 'pending' | 'reject';
  flags: string[]; // List of reasons for manual review or rejection
  score: number; // 0 = Clean, higher scores indicate more suspicious content
}

// ==========================================
// CONFIGURATION
// ==========================================

/**
 * Regex patterns used to identify prohibited content.
 * Note: In a production environment, these should ideally be fetched from a database or configuration service.
 */
const BANNED_PATTERNS = [
  /\b(spam|quảng\s?cáo|mua\s?ngay|click\s?vào|[Ll]ink)\b/gi,
  /(https?:\/\/|www\.)\S+/gi, // URLs
  /(\d{9,11})/g, // Phone numbers
  /[A-Z]{5,}/g, // Excessive ALL CAPS
];

/**
 * Pattern to detect repetitive characters (e.g., "aaaaa" or "!!!!").
 */
const REPETITION_PATTERN = /(.)\1{4,}/g;

// ==========================================
// INTERNAL VALIDATION UTILITIES
// ==========================================

/**
 * Analyzes the title and content text using lexical heuristics.
 *
 * @param {string} title - The review title.
 * @param {string} content - The review body content.
 * @returns {{ flags: string[], score: number }} Moderation flags and calculated severity score.
 */
const checkContent = (title: string, content: string): { flags: string[]; score: number } => {
  const flags: string[] = [];
  let score = 0;
  const text = `${title} ${content}`;

  // 1. Check for banned words or patterns
  for (const pattern of BANNED_PATTERNS) {
    if (pattern.test(text)) {
      flags.push(`banned_pattern:${pattern.source.slice(0, 20)}`);
      score += 50;
    }
  }

  // 2. Check for repetitive character sequences
  if (REPETITION_PATTERN.test(text)) {
    flags.push('repetitive_chars');
    score += 20;
  }

  // 3. Check for content length (avoiding low-effort feedback)
  const wordCount = content.trim().split(/\s+/).length;
  if (wordCount < 5) {
    flags.push('content_too_short');
    score += 30;
  }

  // 4. Check for high density of special characters
  const specialCharRatio = (text.match(/[!?*#@$%^&]/g) || []).length / text.length;
  if (specialCharRatio > 0.1) {
    flags.push('excessive_special_chars');
    score += 15;
  }

  // 5. Check if title is just a snippet of content
  if (title.toLowerCase() === content.toLowerCase().slice(0, title.length)) {
    flags.push('title_content_duplicate');
    score += 10;
  }

  return { flags, score };
};

/**
 * Checks if the user has already submitted a review for this specific product.
 *
 * @param {string} userId - ID of the user.
 * @param {string} productId - ID of the product.
 * @param {string} content - Review content.
 * @returns {Promise<{ flags: string[], score: number }>}
 */
const checkDuplicate = async (
  userId: string,
  productId: string,
  _content: string
): Promise<{ flags: string[]; score: number }> => {
  const flags: string[] = [];
  let score = 0;

  const existing = await Review.findOne({ user: userId, product: productId });
  if (existing) {
    flags.push('duplicate_review');
    score += 100; // Hard block
  }

  return { flags, score };
};

/**
 * Evaluates the user's recent activity to detect spam behavior patterns.
 *
 * @param {string} userId - ID of the user.
 * @returns {Promise<{ flags: string[], score: number }>}
 */
const checkUserHistory = async (userId: string): Promise<{ flags: string[]; score: number }> => {
  const flags: string[] = [];
  let score = 0;

  // Check for rejected reviews in the last 30 days
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const recentRejected = await Review.countDocuments({
    user: userId,
    'moderation.status': 'rejected',
    createdAt: { $gte: thirtyDaysAgo },
  });

  if (recentRejected >= 3) {
    flags.push('frequent_rejections');
    score += 40;
  }

  // Check for high velocity (burst) of reviews in the last hour
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const recentCount = await Review.countDocuments({
    user: userId,
    createdAt: { $gte: oneHourAgo },
  });

  if (recentCount >= 5) {
    flags.push('high_velocity');
    score += 30;
  }

  return { flags, score };
};

// ==========================================
// MAIN MODERATOR SERVICE
// ==========================================

/**
 * Orchestrates the moderation process for a review.
 *
 * @param {string} userId - User identifier.
 * @param {string} productId - Product identifier.
 * @param {string} title - Review title.
 * @param {string} content - Review body.
 * @param {boolean} isVerifiedPurchase - Whether the purchase is verified.
 * @returns {Promise<ModerationResult>} Final decision and metadata.
 */
export const autoModerate = async (
  userId: string,
  productId: string,
  title: string,
  content: string,
  isVerifiedPurchase: boolean
): Promise<ModerationResult> => {
  const allFlags: string[] = [];
  let totalScore = 0;

  // Run all validation checks in parallel for performance
  const [contentCheck, duplicateCheck, historyCheck] = await Promise.all([
    Promise.resolve(checkContent(title, content)),
    checkDuplicate(userId, productId, content),
    checkUserHistory(userId),
  ]);

  allFlags.push(...contentCheck.flags, ...duplicateCheck.flags, ...historyCheck.flags);
  totalScore += contentCheck.score + duplicateCheck.score + historyCheck.score;

  // Decision Logic Matrix

  // Rule 1: Immediate Rejection for severe violations
  if (
    duplicateCheck.flags.includes('duplicate_review') ||
    allFlags.some(f => f.startsWith('banned_pattern'))
  ) {
    return { decision: 'reject', flags: allFlags, score: totalScore };
  }

  // Rule 2: Escalation to Manual Review for high suspicion scores
  if (totalScore >= 30) {
    return { decision: 'pending', flags: allFlags, score: totalScore };
  }

  // Rule 3: Auto-Approve if user is verified and has no red flags
  if (isVerifiedPurchase && totalScore === 0) {
    return { decision: 'approve', flags: [], score: 0 };
  }

  // Rule 4: Default to manual review if any flags exist
  if (totalScore > 0) {
    return { decision: 'pending', flags: allFlags, score: totalScore };
  }

  // Rule 5: Fallback for non-verified users with 0 score (safety first)
  return { decision: 'pending', flags: [], score: 0 };
};
