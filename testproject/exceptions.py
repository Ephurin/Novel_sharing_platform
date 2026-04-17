import logging

from rest_framework import status
from rest_framework.exceptions import ErrorDetail, ValidationError
from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_exception_handler

logger = logging.getLogger(__name__)


class AppError(Exception):
    """Application-level custom exception with standardized payload metadata."""

    def __init__(self, message, error='APP_ERROR', status_code=status.HTTP_400_BAD_REQUEST):
        self.message = message
        self.error = error
        self.status_code = status_code
        super().__init__(message)


def _flatten_message(data):
    if isinstance(data, dict):
        if 'detail' in data:
            return _flatten_message(data['detail'])
        first_value = next(iter(data.values()), 'Invalid request.')
        return _flatten_message(first_value)
    if isinstance(data, list):
        if not data:
            return 'Invalid request.'
        return _flatten_message(data[0])
    if isinstance(data, ErrorDetail):
        return str(data)
    return str(data)


def _map_error_code(exc, status_code):
    if isinstance(exc, ValidationError) or status_code == status.HTTP_400_BAD_REQUEST:
        return 'INVALID_DATA'
    if status_code == status.HTTP_401_UNAUTHORIZED:
        return 'UNAUTHORIZED'
    if status_code == status.HTTP_403_FORBIDDEN:
        return 'FORBIDDEN'
    if status_code == status.HTTP_404_NOT_FOUND:
        return 'NOT_FOUND'
    if status_code >= 500:
        return 'INTERNAL_ERROR'
    return 'API_ERROR'


def custom_exception_handler(exc, context):
    """Global DRF exception handler to normalize all API error responses."""
    if isinstance(exc, AppError):
        return Response(
            {
                'error': exc.error,
                'message': str(exc.message),
                'status': exc.status_code,
            },
            status=exc.status_code,
        )

    response = drf_exception_handler(exc, context)

    if response is not None:
        response.data = {
            'error': _map_error_code(exc, response.status_code),
            'message': _flatten_message(response.data),
            'status': response.status_code,
        }
        return response

    logger.exception('Unhandled exception in API view', exc_info=exc)
    return Response(
        {
            'error': 'INTERNAL_ERROR',
            'message': 'An unexpected error occurred.',
            'status': status.HTTP_500_INTERNAL_SERVER_ERROR,
        },
        status=status.HTTP_500_INTERNAL_SERVER_ERROR,
    )
