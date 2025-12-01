import os
import json
import unittest
from unittest.mock import patch, MagicMock

import sys

# Add mocks directory to path so imports of boto3/botocore work
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'mocks'))

# Import the functions to test using package import
from backend.dispatcher_lambda import dispatcher_handler, get_user_id_from_token, get_user_info_from_token

# Simple dummy DynamoDB implementation
class DummyTable:
    def __init__(self):
        self.store = {}
    def get_item(self, Key):
        user_id = Key.get('userId')
        return {'Item': self.store.get(user_id)}
    def put_item(self, Item):
        self.store[Item['userId']] = Item
    def update_item(self, **kwargs):
        key = kwargs.get('Key', {})
        uid = key.get('userId')
        item = self.store.get(uid, {})
        expr = kwargs.get('UpdateExpression', '')
        # Handle credit decrement
        if 'set credits = if_not_exists(credits, :start) - :dec' in expr:
            start = kwargs['ExpressionAttributeValues'].get(':start', 0)
            dec = kwargs['ExpressionAttributeValues'].get(':dec', 1)
            credits = item.get('credits', start) - dec
            item['credits'] = credits
        # Handle generic SET updates for email/name
        elif expr.startswith('SET'):
            names = kwargs.get('ExpressionAttributeNames', {})
            values = kwargs.get('ExpressionAttributeValues', {})
            for placeholder, attr_name in names.items():
                # placeholder like '#e' maps to attr_name like 'email'
                # value placeholder is like ':e' -> values[':e']
                value_key = f":{attr_name[0].lower()}"
                if value_key in values:
                    item[attr_name] = values[value_key]
        self.store[uid] = item

class DummyDynamoDB:
    def __init__(self):
        self.tables = {}
    def Table(self, name):
        if name not in self.tables:
            self.tables[name] = DummyTable()
        return self.tables[name]

# Dummy Step Functions client
class DummySFN:
    def start_execution(self, **kwargs):
        return {'executionArn': 'arn:aws:states:execution:test'}

class DispatcherHandlerTests(unittest.TestCase):
    @patch('urllib.request.urlopen')
    def test_dispatcher_creates_profile_for_new_user_returns_404(self, mock_urlopen):
        # Mock token info response with email and name
        token_info = json.dumps({
            'sub': 'test-user-id',
            'email': 'test@example.com',
            'name': 'Test User'
        }).encode('utf-8')
        mock_response = MagicMock()
        mock_response.read.return_value = token_info
        mock_urlopen.return_value.__enter__.return_value = mock_response

        # Set up dummy DynamoDB and Step Functions
        db_instance = DummyDynamoDB()
        sfn_instance = DummySFN()

        # Mock environment variables
        os.environ['USER_TABLE_NAME'] = 'Users'
        os.environ['TABLE_NAME'] = 'Jobs'
        os.environ['STATE_MACHINE_ARN'] = 'arn:aws:states:us-east-1:123456789012:stateMachine:TestStateMachine'

        event = {
            'headers': {'Authorization': 'Bearer fake-token'},
            'body': json.dumps({
                'itemUrl': 'https://example.com/item.jpg',
                'selfieId': 'selfie-123',
                'siteUrl': 'https://example.com'
            })
        }

        with patch('backend.dispatcher_lambda.dynamodb', db_instance), \
             patch('backend.dispatcher_lambda.sfn_client', sfn_instance):
            
            response = dispatcher_handler(event, None)
            
            # Expect 404 because new user has no selfies
            self.assertEqual(response['statusCode'], 404)
            
            # Verify user profile stored with email/name and default credits
            user_table = db_instance.Table('Users')
            stored_user = user_table.get_item(Key={'userId': 'test-user-id'}).get('Item')
            
            self.assertIsNotNone(stored_user)
            self.assertEqual(stored_user.get('credits'), 5)
            self.assertEqual(stored_user.get('email'), 'test@example.com')
            self.assertEqual(stored_user.get('name'), 'Test User')

    @patch('urllib.request.urlopen')
    def test_dispatcher_starts_job_for_existing_user(self, mock_urlopen):
        # Mock token info
        token_info = json.dumps({
            'sub': 'test-user-id',
            'email': 'test@example.com',
            'name': 'Test User'
        }).encode('utf-8')
        mock_response = MagicMock()
        mock_response.read.return_value = token_info
        mock_urlopen.return_value.__enter__.return_value = mock_response

        # Pre-populate DB with user and selfie
        db_instance = DummyDynamoDB()
        user_table = db_instance.Table('Users')
        user_table.put_item({
            'userId': 'test-user-id',
            'credits': 5,
            'email': 'test@example.com',
            'name': 'Test User',
            'images': [{'id': 'selfie-123', 's3Url': 'https://s3/selfie.jpg'}]
        })
        
        sfn_instance = DummySFN()

        os.environ['USER_TABLE_NAME'] = 'Users'
        os.environ['TABLE_NAME'] = 'Jobs'
        os.environ['STATE_MACHINE_ARN'] = 'arn:aws:states:us-east-1:123456789012:stateMachine:TestStateMachine'

        event = {
            'headers': {'Authorization': 'Bearer fake-token'},
            'body': json.dumps({
                'itemUrl': 'https://example.com/item.jpg',
                'selfieId': 'selfie-123',
                'siteUrl': 'https://example.com'
            })
        }

        with patch('backend.dispatcher_lambda.dynamodb', db_instance), \
             patch('backend.dispatcher_lambda.sfn_client', sfn_instance):

            response = dispatcher_handler(event, None)
            body = json.loads(response['body'])
            
            self.assertEqual(response['statusCode'], 200)
            self.assertIn('jobId', body)
            self.assertIn('executionArn', body)

    @patch('urllib.request.urlopen')
    def test_get_user_id_from_token_fallback(self, mock_urlopen):
        # Simulate token validation failure, fallback to x-user-id header
        mock_urlopen.side_effect = Exception('Network error')
        event = {'headers': {'x-user-id': 'fallback-id'}}
        user_id = get_user_id_from_token(event)
        self.assertEqual(user_id, 'fallback-id')

    @patch('urllib.request.urlopen')
    def test_get_user_info_from_token_success(self, mock_urlopen):
        token_info = json.dumps({
            'email': 'info@example.com',
            'name': 'Info User'
        }).encode('utf-8')
        mock_response = MagicMock()
        mock_response.read.return_value = token_info
        mock_urlopen.return_value.__enter__.return_value = mock_response
        event = {'headers': {'Authorization': 'Bearer token123'}}
        info = get_user_info_from_token(event)
        self.assertEqual(info['email'], 'info@example.com')
        self.assertEqual(info['name'], 'Info User')

if __name__ == '__main__':
    unittest.main()
