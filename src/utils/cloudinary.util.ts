export const getPublicIdFromUrl = (url: string): string | null => {
  try {
    if (!url || !url.includes('/upload/')) return null;
    const parts = url.split('/upload/');

    // Protect the code if parts[1] do not exist.
    if (!parts[1]) return null;

    const publicIdWithExt = parts[1].replace(/^v\d+\//, '');
    return publicIdWithExt.substring(0, publicIdWithExt.lastIndexOf('.'));
  } catch (error) {
    console.error('Error extracting public_id:', error);
    return null;
  }
};
