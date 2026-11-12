const { error } = require('../utils/apiResponse');

/**
 * Zod schema validation middleware factory.
 * Compatible with Zod v3 (.errors) and v4 (.issues).
 */
const validate = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    // Zod v4 uses .issues, v3 uses .errors — handle both
    const issues = result.error?.issues || result.error?.errors || [];
    const errors = issues.map((e) => ({
      field: Array.isArray(e.path) ? e.path.join('.') : String(e.path),
      message: e.message,
    }));
    return error(res, errors[0]?.message || 'Validation failed', 400, errors);
  }
  req.body = result.data;
  next();
};

module.exports = validate;
