# Simple stub for moto's mock_dynamodb2 decorator

def mock_dynamodb2(func):
    """A no‑op decorator used in tests to replace moto's mock_dynamodb2.
    It simply returns the original function unchanged.
    """
    return func
