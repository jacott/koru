class HttpError extends Error {
  constructor({message='Bad Request', statusCode, response, body}={}) {
    if (statusCode === undefined) {
      statusCode = response === undefined ? 400 : response.statusCode;
    }
    super(`${message} [${statusCode}]`);
    this.statusCode = statusCode;
    this.response = response;
    this.body = body;
  }
}

module.exports = HttpError;
