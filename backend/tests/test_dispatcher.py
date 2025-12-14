import os
import json
import unittest
from unittest.mock import patch, MagicMock
import datetime
import sys

# Add mocks directory to path so imports of boto3/botocore work
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'mocks'))

# Import the functions to test using package import
from backend.dispatcher_lambda import (
    dispatcher_handler, get_user_id_from_token, get_user_info_from_token,
    profile_handler, status_handler, saver_handler,
    payment_link_handler, payment_webhook_handler, get_payment_url_handler
)

class DummyTable:
    def __init__(self, name=''):
        self.store = {}
        self.name = name
    
    def _get_key_val(self, Key):
        if len(Key) == 1:
            pk = list(Key.keys())[0]
            val = Key[pk]
            return str(val)
        else:
            return "-".join([str(v) for v in Key.values()])

    def get_item(self, Key):
        key_val = self._get_key_val(Key)
        item = self.store.get(key_val)
        if item:
            return {'Item': item}
        return {}

    def put_item(self, Item):
        if 'userId' in Item and 'timestamp' not in Item:
            self.store[Item['userId']] = Item
        elif 'jobId' in Item and 'userId' not in Item:
             self.store[Item['jobId']] = Item
        elif 'userId' in Item and 'timestamp' in Item:
            key = f"{Item['userId']}-{Item['timestamp']}"
            self.store[key] = Item
        else:
            key = list(Item.values())[0]
            self.store[key] = Item

    def update_item(self, **kwargs):
        key = kwargs.get('Key', {})
        uid = None
        if 'userId' in key:
            uid = key['userId']
        elif 'jobId' in key:
            uid = key['jobId']
        if not uid:
             uid = list(key.values())[0]
        
        # Get existing item (copy to avoid in-place mutation affecting check)
        existing_item = self.store.get(str(uid))
        if not existing_item:
             existing_item = self.store.get(uid, {})
        
        # Deepish copy
        existing_item = existing_item.copy() if existing_item else {}

        cond = kwargs.get('ConditionExpression', '')
        vals = kwargs.get('ExpressionAttributeValues', {})
        
        if 'NOT contains(processed_payments' in cond:
             pid = vals.get(':pid')
             pids = existing_item.get('processed_payments', [])
             if pid in pids:
                 from botocore.exceptions import ClientError
                 raise ClientError({'Error': {'Code': 'ConditionalCheckFailedException'}}, 'UpdateItem')

        # Apply Updates to a new item state (starting from existing)
        item = existing_item.copy()
        # Ensure we have the key in the item if it was empty (creating new)
        if not item:
            item = key.copy()

        expr = kwargs.get('UpdateExpression', '')
        
        if 'credits' in expr:
            start = vals.get(':start', 0)
            if '- :dec' in expr:
                dec = vals.get(':dec', 1)
                curr = item.get('credits', start)
                item['credits'] = curr - dec
            elif '+ :inc' in expr:
                inc = vals.get(':inc', 1)
                curr = item.get('credits', start)
                item['credits'] = curr + inc
        
        # Handle SET updates generally (case-insensitive check)
        if 'SET' in expr.upper():
            if 'list_append' in expr.lower():
                new_imgs = vals.get(':new_image', [])
                current_imgs = item.get('images', [])
                if isinstance(new_imgs, list):
                    item['images'] = current_imgs + new_imgs
                
                new_pids = vals.get(':new_pid_list', [])
                current_pids = item.get('processed_payments', [])
                if isinstance(new_pids, list):
                    item['processed_payments'] = current_pids + new_pids
            
            else:
                if ':n' in vals: item['name'] = vals[':n']
                if ':p' in vals: item['picture'] = vals[':p']
                if ':e' in vals: item['email'] = vals[':e']
                if ':s' in vals: item['status'] = vals[':s']
                if ':error' in vals or ':e' in vals: 
                    if 'status' in item:
                         if ':e' in vals and isinstance(vals[':e'], str): item['error'] = vals[':e']
                
                if ':new_images' in vals:
                    item['images'] = vals[':new_images']
                
                if '[' in expr and '].#n' in expr:
                     try:
                         idx_s = expr.split('[')[1].split(']')[0]
                         idx = int(idx_s)
                         new_name = vals[':name']
                         if 'images' in item and len(item['images']) > idx:
                             item['images'][idx]['name'] = new_name
                     except:
                         pass

        self.store[str(uid)] = item

    def delete_item(self, Key):
        key_val = self._get_key_val(Key)
        if key_val and key_val in self.store:
            del self.store[key_val]

    def query(self, **kwargs):
        items = []
        for v in self.store.values():
            items.append(v)
        return {'Items': items}

class DummyDynamoDB:
    def __init__(self):
        self.tables = {}
    def Table(self, name):
        if name not in self.tables:
            self.tables[name] = DummyTable(name)
        return self.tables[name]

# Dummy Step Functions client
class DummySFN:
    def start_execution(self, **kwargs):
        return {'executionArn': 'arn:aws:states:execution:test'}

# Dummy S3 Client
class DummyS3:
    def generate_presigned_url(self, Operation, Params, ExpiresIn):
        return f"https://s3-presigned-url/{Params['Key']}"
    
    def put_object(self, **kwargs):
        pass
    
    def delete_object(self, **kwargs):
        pass

class DispatcherHandlerTests(unittest.TestCase):
    def setUp(self):
        # Common setup
        self.db_instance = DummyDynamoDB()
        self.sfn_instance = DummySFN()
        self.s3_instance = DummyS3()
        
        os.environ['USER_TABLE_NAME'] = 'Users'
        os.environ['TABLE_NAME'] = 'Jobs'
        os.environ['USER_GENERATIONS_TABLE_NAME'] = 'Generations'
        os.environ['BUCKET_NAME'] = 'test-bucket'
        os.environ['STATE_MACHINE_ARN'] = 'arn:aws:states:test'
        os.environ['PRODAMUS_SECRET_KEY'] = 'secret'
        os.environ['GEMINI_API_KEY'] = 'test-key'
        os.environ['GEMINI_API_URL'] = 'https://api.gemini'
        # Default success URL if needed
        os.environ['PRODAMUS_SUCCESS_URL'] = 'https://success.url'

    @patch('urllib.request.urlopen')
    def test_dispatcher_creates_profile_for_new_user_returns_404(self, mock_urlopen):
        token_info = json.dumps({'sub': 'test-user', 'email': 't@e.com', 'name': 'T'}).encode('utf-8')
        mock_response = MagicMock()
        mock_response.read.return_value = token_info
        mock_urlopen.return_value.__enter__.return_value = mock_response

        event = {
            'headers': {'Authorization': 'Bearer token'},
            'body': json.dumps({'itemUrl': 'u', 'selfieId': 's', 'siteUrl': 'su'})
        }

        with patch('backend.dispatcher_lambda.dynamodb', self.db_instance), \
             patch('backend.dispatcher_lambda.sfn_client', self.sfn_instance):
            resp = dispatcher_handler(event, None)
            self.assertEqual(resp['statusCode'], 404)
            # Check user created
            table = self.db_instance.Table('Users')
            user = table.get_item(Key={'userId': 'test-user'})['Item']
            self.assertEqual(user['email'], 't@e.com')

    @patch('backend.dispatcher_lambda.get_user_id_from_token')
    def test_profile_handler_get_profile(self, mock_get_uid):
        mock_get_uid.return_value = 'test-user'
        
        table = self.db_instance.Table('Users')
        table.put_item({'userId': 'test-user', 'credits': 10, 'name': 'Existing'})
        
        event = {
            'rawPath': '/user/profile',
            'requestContext': {'http': {'method': 'GET'}}
        }
        
        with patch('backend.dispatcher_lambda.dynamodb', self.db_instance), \
             patch('backend.dispatcher_lambda.get_user_info_from_token', return_value=None):
            resp = profile_handler(event, None)
            self.assertEqual(resp['statusCode'], 200)
            body = json.loads(resp['body'])
            self.assertEqual(body['credits'], 10)
            self.assertEqual(body['name'], 'Existing')

    @patch('backend.dispatcher_lambda.get_user_id_from_token')
    def test_profile_handler_upload_url(self, mock_get_uid):
        mock_get_uid.return_value = 'test-user'
        event = {
            'rawPath': '/user/images/upload-url',
            'requestContext': {'http': {'method': 'POST'}},
            'body': json.dumps({'filename': 'test.jpg', 'contentType': 'image/jpeg'})
        }
        
        with patch('backend.dispatcher_lambda.dynamodb', self.db_instance), \
             patch('backend.dispatcher_lambda.s3_client', self.s3_instance):
            resp = profile_handler(event, None)
            self.assertEqual(resp['statusCode'], 200)
            body = json.loads(resp['body'])
            self.assertIn('uploadUrl', body)
            self.assertIn('fileId', body)

    @patch('backend.dispatcher_lambda.get_user_id_from_token')
    def test_profile_handler_confirm_upload(self, mock_get_uid):
        mock_get_uid.return_value = 'test-user'
        table = self.db_instance.Table('Users')
        table.put_item({'userId': 'test-user', 'images': []})
        
        event = {
            'rawPath': '/user/images',
            'requestContext': {'http': {'method': 'POST'}},
            'body': json.dumps({
                'name': 'My Selfie',
                's3Key': 'k',
                'fileId': 'f1'
            })
        }
        
        with patch('backend.dispatcher_lambda.dynamodb', self.db_instance):
            resp = profile_handler(event, None)
            self.assertEqual(resp['statusCode'], 200)
            
            # Verify added to DB
            user = table.get_item(Key={'userId': 'test-user'})['Item']
            self.assertEqual(len(user['images']), 1)
            self.assertEqual(user['images'][0]['id'], 'f1')

    @patch('backend.dispatcher_lambda.get_user_id_from_token')
    def test_profile_handler_delete_image(self, mock_get_uid):
        mock_get_uid.return_value = 'test-user'
        table = self.db_instance.Table('Users')
        table.put_item({
            'userId': 'test-user', 
            'images': [{'id': 'f1', 's3Key': 'k1'}, {'id': 'f2', 's3Key': 'k2'}]
        })
        
        event = {
            'rawPath': '/user/images/f1',
            'requestContext': {'http': {'method': 'DELETE'}}
        }
        
        with patch('backend.dispatcher_lambda.dynamodb', self.db_instance), \
             patch('backend.dispatcher_lambda.s3_client', self.s3_instance):
            resp = profile_handler(event, None)
            self.assertEqual(resp['statusCode'], 200)
            
            user = table.get_item(Key={'userId': 'test-user'})['Item']
            self.assertEqual(len(user['images']), 1)
            self.assertEqual(user['images'][0]['id'], 'f2')

    def test_status_handler(self):
        table = self.db_instance.Table('Jobs')
        table.put_item({'jobId': 'job-123', 'status': 'PROCESSING'})
        
        event = {'pathParameters': {'jobId': 'job-123'}}
        
        with patch('backend.dispatcher_lambda.dynamodb', self.db_instance):
            resp = status_handler(event, None)
            self.assertEqual(resp['statusCode'], 200)
            body = json.loads(resp['body'])
            self.assertEqual(body['status'], 'PROCESSING')

    def test_saver_handler_success(self):
        event = {
            'jobId': 'job-success',
            'userId': 'u1',
            'resultUrl': 'http://res',
            'status': 'COMPLETED'
        }
        
        with patch('backend.dispatcher_lambda.dynamodb', self.db_instance):
            saver_handler(event, None)
            
            table = self.db_instance.Table('Jobs')
            job = table.get_item(Key={'jobId': 'job-success'})['Item']
            self.assertEqual(job['status'], 'COMPLETED')
            self.assertEqual(job['resultUrl'], 'http://res')
            
            # Generations table check (Mock puts items blindly)
            gen_table = self.db_instance.Table('Generations')
            self.assertTrue(len(gen_table.store) > 0)

    @patch('backend.dispatcher_lambda.get_user_id_from_token')
    def test_payment_link_handler(self, mock_get_uid):
        mock_get_uid.return_value = 'user-pay'
        event = {
            'body': json.dumps({'tariffName': 'Starter', 'lang': 'en'})
        }
        
        with patch('backend.dispatcher_lambda.dynamodb', self.db_instance):
            resp = payment_link_handler(event, None)
            self.assertEqual(resp['statusCode'], 200)
            body = json.loads(resp['body'])
            self.assertIn('url', body)
            self.assertIn('web-wardrobe-eng.payform.ru', body['url'])

    def test_payment_webhook_handler(self):
        # We need to construct a valid signature for the test
        import hmac
        import hashlib
        
        secret = 'secret'
        data = {
            'payment_status': 'success',
            'customer_extra': 'user-1',
            'sum': '800', # Starter
            'sku': 'starter',
            'payment_id': 'pid-1'
        }
        
        # Sort and serialize exactly as handler does
        sorted_data = {k: str(data[k]) for k in sorted(data)}
        json_str = json.dumps(sorted_data, separators=(',', ':'), ensure_ascii=False).replace('/', '\\/')
        
        signature = hmac.new(secret.encode(), json_str.encode(), hashlib.sha256).hexdigest()
        
        event = {
            'headers': {'Sign': signature, 'Content-Type': 'application/json'},
            'body': json.dumps(data)
        }
        
        user_table = self.db_instance.Table('Users')
        user_table.put_item({'userId': 'user-1', 'credits': 0})
        
        with patch('backend.dispatcher_lambda.dynamodb', self.db_instance):
            resp = payment_webhook_handler(event, None)
            self.assertEqual(resp['statusCode'], 200, f"Response: {resp}")
            
            user = user_table.get_item(Key={'userId': 'user-1'})['Item']
            self.assertEqual(user['credits'], 25)

            # Test idempotency (replay)
            resp = payment_webhook_handler(event, None)
            self.assertEqual(resp['body'], 'Already processed')
            self.assertEqual(user['credits'], 25) # Should not increase

    def test_get_payment_url_handler(self):
        resp = get_payment_url_handler({}, None)
        self.assertEqual(resp['statusCode'], 200)

if __name__ == '__main__':
    unittest.main()
