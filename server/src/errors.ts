export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Used for both "doesn't exist" and "no access" so a document id
 * never reveals whether the document exists.
 */
export const notFound = () => new HttpError(404, "Document not found.");
