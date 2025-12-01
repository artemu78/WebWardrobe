class ClientError(Exception):
    """A minimal stub for botocore.exceptions.ClientError used in tests."""
    def __init__(self, error_response=None, operation_name=None):
        super().__init__(error_response)
        self.response = error_response or {}
        self.operation_name = operation_name
