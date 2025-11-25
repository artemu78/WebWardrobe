import json
import os
import uuid
import datetime
import boto3
import base64
import urllib.parse


from botocore.exceptions import ClientError

# Initialize clients
sfn_client = boto3.client('stepfunctions')
dynamodb = boto3.resource('dynamodb')
s3_client = boto3.client('s3')

import urllib.request

def get_user_id_from_token(event):
    """
    Extracts user ID from Authorization header (Google OAuth Token)
    or x-user-id header (Mock/Legacy).
    """
    headers = event.get('headers', {})
    
    # 1. Check for Authorization header (Bearer Token)
    auth_header = headers.get('authorization') or headers.get('Authorization')
    if auth_header:
        token = auth_header.replace('Bearer ', '').strip()
        try:
            # Validate with Google
            url = f"https://www.googleapis.com/oauth2/v3/tokeninfo?access_token={token}"
            with urllib.request.urlopen(url) as response:
                data = json.loads(response.read().decode())
                # 'sub' is the unique user ID
                return data.get('sub')
        except Exception as e:
            print(f"Token validation failed: {e}")
            # Fall through to check other headers if validation fails
            pass

    # 2. Fallback: Check x-user-id (Mock/Testing)
    user_id = headers.get('x-user-id') or headers.get('X-User-Id')
    if user_id:
        return user_id

    # 3. Fallback: Check body
    try:
        body = json.loads(event.get('body', '{}'))
        return body.get('userId')
    except:
        return None

def dispatcher_handler(event, context):
    """
    Triggered by POST /try-on
    Body: { itemUrl, selfieId }
    Headers: { x-user-id: ... }
    """
    try:
        body = json.loads(event.get('body', '{}'))
        item_url = body.get('itemUrl')
        selfie_id = body.get('selfieId')
        user_id = get_user_id_from_token(event)

        if not item_url or not selfie_id or not user_id:
            return {
                'statusCode': 400,
                'body': json.dumps({'error': 'Missing itemUrl, selfieId, or user authentication'})
            }

        # Lookup Selfie URL
        user_table_name = os.environ['USER_TABLE_NAME']
        user_table = dynamodb.Table(user_table_name)
        
        user_profile = user_table.get_item(Key={'userId': user_id}).get('Item')
        if not user_profile:
             return {'statusCode': 404, 'body': json.dumps({'error': 'User profile not found'})}
             
        images = user_profile.get('images', [])
        selfie_url = next((img['s3Url'] for img in images if img['id'] == selfie_id), None)
        
        if not selfie_url:
            return {'statusCode': 404, 'body': json.dumps({'error': 'Selfie not found'})}

        job_id = str(uuid.uuid4())
        state_machine_arn = os.environ['STATE_MACHINE_ARN']

        # Input for the Step Function
        sfn_input = {
            'jobId': job_id,
            'userId': user_id,
            'itemUrl': item_url,
            'selfieUrl': selfie_url,
            'selfieId': selfie_id
        }

        # Initialize Job Status in DynamoDB
        table_name = os.environ['TABLE_NAME']
        job_table = dynamodb.Table(table_name)
        job_table.put_item(
            Item={
                'jobId': job_id,
                'status': 'PROCESSING',
                'userId': user_id,
                'timestamp': datetime.datetime.utcnow().isoformat()
            }
        )

        response = sfn_client.start_execution(
            stateMachineArn=state_machine_arn,
            name=job_id,
            input=json.dumps(sfn_input)
        )

        return {
            'statusCode': 200,
            'body': json.dumps({
                'jobId': job_id,
                'executionArn': response['executionArn'],
                'message': 'Try-on job started'
            })
        }

    except Exception as e:
        print(f"Error in dispatcher: {e}")
        return {
            'statusCode': 500,
            'body': json.dumps({'error': str(e)})
        }

def profile_handler(event, context):
    """
    Handles /user/images routes
    """
    try:
        path = event.get('rawPath') or event.get('path') # HTTP API uses rawPath
        method = event.get('requestContext', {}).get('http', {}).get('method')
        user_id = get_user_id_from_token(event)
        
        if not user_id:
             return {'statusCode': 401, 'body': json.dumps({'error': 'Unauthorized'})}

        user_table_name = os.environ['USER_TABLE_NAME']
        bucket_name = os.environ['BUCKET_NAME']
        user_table = dynamodb.Table(user_table_name)

        # GET /user/generations
        if method == 'GET' and 'generations' in path:
            generations_table_name = os.environ['USER_GENERATIONS_TABLE_NAME']
            gen_table = dynamodb.Table(generations_table_name)

            # Query generations for the user
            # Since timestamp is the sort key, we can query by userId
            try:
                response = gen_table.query(
                    KeyConditionExpression=boto3.dynamodb.conditions.Key('userId').eq(user_id),
                    ScanIndexForward=False  # Newest first
                )
                items = response.get('Items', [])
                return {
                    'statusCode': 200,
                    'body': json.dumps({'generations': items})
                }
            except Exception as e:
                print(f"Error fetching generations: {e}")
                return {'statusCode': 500, 'body': json.dumps({'error': str(e)})}

        # POST /user/images/upload-url
        elif method == 'POST' and 'upload-url' in path:
            body = json.loads(event.get('body', '{}'))
            filename = body.get('filename')
            content_type = body.get('contentType', 'image/jpeg')
            include_thumbnail = body.get('includeThumbnail', False)
            
            file_id = str(uuid.uuid4())
            s3_key = f"uploads/{user_id}/{file_id}-{filename}"
            
            # Generate Presigned URL for Original
            url = s3_client.generate_presigned_url(
                'put_object',
                Params={'Bucket': bucket_name, 'Key': s3_key, 'ContentType': content_type},
                ExpiresIn=300
            )
            
            response_data = {
                'uploadUrl': url,
                's3Key': s3_key,
                'fileId': file_id
            }

            # Generate Presigned URL for Thumbnail if requested
            if include_thumbnail:
                thumb_filename = f"thumb-{filename}"
                thumb_s3_key = f"uploads/{user_id}/{file_id}-{thumb_filename}"
                thumb_url = s3_client.generate_presigned_url(
                    'put_object',
                    Params={'Bucket': bucket_name, 'Key': thumb_s3_key, 'ContentType': content_type},
                    ExpiresIn=300
                )
                response_data['thumbnailUploadUrl'] = thumb_url
                response_data['thumbnailS3Key'] = thumb_s3_key
            
            return {
                'statusCode': 200,
                'body': json.dumps(response_data)
            }

        # POST /user/images (Confirm upload)
        elif method == 'POST':
            body = json.loads(event.get('body', '{}'))
            name = body.get('name')
            s3_key = body.get('s3Key')
            file_id = body.get('fileId')
            thumbnail_s3_key = body.get('thumbnailS3Key')
            
            if not name or not s3_key or not file_id:
                return {'statusCode': 400, 'body': json.dumps({'error': 'Missing fields'})}
            
            # Check limit
            user_profile = user_table.get_item(Key={'userId': user_id}).get('Item', {})
            current_images = user_profile.get('images', [])
            if len(current_images) >= 5:
                 return {'statusCode': 400, 'body': json.dumps({'error': 'Maximum 5 images allowed'})}

            s3_url = f"https://{bucket_name}.s3.amazonaws.com/{s3_key}"
            
            new_image_item = {
                'id': file_id,
                'name': name,
                's3Url': s3_url,
                's3Key': s3_key
            }

            if thumbnail_s3_key:
                new_image_item['thumbnailS3Key'] = thumbnail_s3_key
                new_image_item['thumbnailUrl'] = f"https://{bucket_name}.s3.amazonaws.com/{thumbnail_s3_key}"

            # Add to DynamoDB list
            user_table.update_item(
                Key={'userId': user_id},
                UpdateExpression="SET #i = list_append(if_not_exists(#i, :empty_list), :new_image)",
                ExpressionAttributeNames={'#i': 'images'},
                ExpressionAttributeValues={
                    ':new_image': [new_image_item],
                    ':empty_list': []
                }
            )
            
            return {
                'statusCode': 200,
                'body': json.dumps({'message': 'Image saved', 'id': file_id, 'url': s3_url})
            }

        # GET /user/images
        elif method == 'GET':
            response = user_table.get_item(Key={'userId': user_id})
            item = response.get('Item', {})
            images = item.get('images', [])
            return {
                'statusCode': 200,
                'body': json.dumps({'images': images})
            }

        # DELETE /user/images/{fileId}
        elif method == 'DELETE':
            # Extract fileId from path
            # Path format: /user/images/{fileId}
            # We need to parse it manually or rely on path parameters if configured
            # Since we use rawPath, let's parse.
            parts = path.split('/')
            if len(parts) < 4:
                 return {'statusCode': 400, 'body': json.dumps({'error': 'Invalid path'})}
            
            file_id = parts[-1]
            
            # Get current images
            response = user_table.get_item(Key={'userId': user_id})
            item = response.get('Item', {})
            images = item.get('images', [])
            
            # Find image to remove
            image_to_remove = next((img for img in images if img['id'] == file_id), None)
            
            if not image_to_remove:
                return {'statusCode': 404, 'body': json.dumps({'error': 'Image not found'})}
            
            # Remove from S3
            try:
                s3_client.delete_object(Bucket=bucket_name, Key=image_to_remove['s3Key'])
                if 'thumbnailS3Key' in image_to_remove:
                    s3_client.delete_object(Bucket=bucket_name, Key=image_to_remove['thumbnailS3Key'])
            except Exception as e:
                print(f"Failed to delete from S3: {e}")
                # Continue to remove from DB even if S3 fails
            
            # Remove from DynamoDB
            # We have to read-modify-write or use REMOVE with index if we knew the index.
            # Since list is small (max 5), read-modify-write is fine and safer.
            new_images = [img for img in images if img['id'] != file_id]
            
            user_table.update_item(
                Key={'userId': user_id},
                UpdateExpression="SET #i = :new_images",
                ExpressionAttributeNames={'#i': 'images'},
                ExpressionAttributeValues={':new_images': new_images}
            )
            
            return {
                'statusCode': 200,
                'body': json.dumps({'message': 'Image deleted'})
            }

        # PATCH /user/images/{fileId} (Rename)
        elif method == 'PATCH':
            # Extract fileId from path
            parts = path.split('/')
            if len(parts) < 4:
                 return {'statusCode': 400, 'body': json.dumps({'error': 'Invalid path'})}
            
            file_id = parts[-1]
            
            body = json.loads(event.get('body', '{}'))
            new_name = body.get('name')
            
            if not new_name:
                return {'statusCode': 400, 'body': json.dumps({'error': 'Missing new name'})}

            # Get current images
            response = user_table.get_item(Key={'userId': user_id})
            item = response.get('Item', {})
            images = item.get('images', [])
            
            # Find image to update
            image_index = next((index for (index, img) in enumerate(images) if img['id'] == file_id), -1)
            
            if image_index == -1:
                return {'statusCode': 404, 'body': json.dumps({'error': 'Image not found'})}
            
            # Update the name in the list
            # We can use list index to update specific item in DynamoDB list
            user_table.update_item(
                Key={'userId': user_id},
                UpdateExpression=f"SET #i[{image_index}].#n = :name",
                ExpressionAttributeNames={'#i': 'images', '#n': 'name'},
                ExpressionAttributeValues={':name': new_name}
            )
            
            return {
                'statusCode': 200,
                'body': json.dumps({'message': 'Image renamed'})
            }

        else:
            return {'statusCode': 404, 'body': json.dumps({'error': 'Not found'})}

    except Exception as e:
        print(f"Error in profile handler: {e}")
        return {
            'statusCode': 500,
            'body': json.dumps({'error': str(e)})
        }

def status_handler(event, context):
    """
    Triggered by GET /status/{jobId}
    Checks DynamoDB for job status.
    """
    try:
        job_id = event['pathParameters']['jobId']
        table_name = os.environ['TABLE_NAME']
        table = dynamodb.Table(table_name)

        response = table.get_item(Key={'jobId': job_id})
        item = response.get('Item')

        if not item:
            return {
                'statusCode': 200,
                'body': json.dumps({
                    'status': 'PROCESSING',
                    'timestamp': datetime.datetime.utcnow().isoformat()
                })
            }

        # Update timestamp to reflect current server time as requested
        item['timestamp'] = datetime.datetime.utcnow().isoformat()

        return {
            'statusCode': 200,
            'body': json.dumps(item)
        }

    except Exception as e:
        print(f"Error in status check: {e}")
        return {
            'statusCode': 500,
            'body': json.dumps({'error': str(e)})
        }

def generator_handler(event, context):
    """
    Step Function Task: GenerateImage
    Downloads images, calls Gemini API, saves result to S3.
    """
    try:
        job_id = event['jobId']
        item_url = event['itemUrl']
        selfie_url = event['selfieUrl']
        selfie_id = event.get('selfieId')
        
        api_key = os.environ['GEMINI_API_KEY']
        api_url = os.environ['GEMINI_API_URL']
        bucket_name = os.environ['BUCKET_NAME']

        def download_as_base64(url):
            # Encode URL to handle spaces and special characters
            # We only encode the path part to preserve protocol and domain
            parsed = urllib.parse.urlparse(url)
            encoded_path = urllib.parse.quote(parsed.path)
            encoded_url = urllib.parse.urlunparse(parsed._replace(path=encoded_path))
            
            req = urllib.request.Request(
                encoded_url, 
                headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'}
            )
            
            with urllib.request.urlopen(req) as response:
                return base64.b64encode(response.read()).decode('utf-8')

        print(f"Downloading images for job {job_id}")
        item_b64 = download_as_base64(item_url)
        selfie_b64 = download_as_base64(selfie_url)

        # Construct Payload for Gemini
        payload = {
            "contents": [{
                "parts": [
                    {"text": "Generate a photorealistic image of the person from the first image wearing the clothes from the second image. Maintain the pose and lighting of the person."},
                    {"inline_data": {"mime_type": "image/jpeg", "data": selfie_b64}},
                    {"inline_data": {"mime_type": "image/jpeg", "data": item_b64}}
                ]
            }],
             "generationConfig": {
                "responseModalities": ["IMAGE"],
                "imageConfig": {
                  "aspectRatio": "3:4",
                  "imageSize": "1024x1024" 
                }
              }
        }
        
        print("Calling Gemini API...")
        req = urllib.request.Request(
            api_url,
            data=json.dumps(payload).encode('utf-8'),
            headers={'Content-Type': 'application/json', 'x-goog-api-key': api_key}
        )
        
        # Retry logic for 503 Service Unavailable
        import time
        max_retries = 5
        for attempt in range(max_retries):
            try:
                with urllib.request.urlopen(req) as response:
                    response_data = json.loads(response.read().decode('utf-8'))
                    break # Success
            except urllib.error.HTTPError as e:
                if e.code == 503 and attempt < max_retries - 1:
                    wait_time = (2 ** attempt) * 1 # 1, 2, 4, 8, 16 seconds
                    print(f"Gemini 503 Unavailable. Retrying in {wait_time}s...")
                    time.sleep(wait_time)
                else:
                    raise e
            
        # Extract Image
        candidates = response_data.get('candidates', [])
        if not candidates:
            print("Gemini Response:", response_data)
            raise Exception("No candidates returned from Gemini")
            
        parts = candidates[0].get('content', {}).get('parts', [])
        image_b64 = next((p['inlineData']['data'] for p in parts if 'inlineData' in p), None)
        
        if not image_b64:
             print("Gemini Response:", response_data)
             raise Exception("No image found in Gemini response")

        # Decode and Save to S3
        print("Saving result to S3...")
        image_data = base64.b64decode(image_b64)
        s3_key = f"results/{job_id}.png"
        
        s3_client.put_object(
            Bucket=bucket_name,
            Key=s3_key,
            Body=image_data,
            ContentType='image/png'
        )
        
        result_url = f"https://{bucket_name}.s3.amazonaws.com/{s3_key}"
        
        return {
            'jobId': job_id,
            'status': 'COMPLETED', 
            'resultUrl': result_url
        }

    except Exception as e:
        print(f"Generator failed: {e}")
        raise e

def saver_handler(event, context):
    """
    Step Function Task: SaveResult or JobFailed
    Updates DynamoDB with the result or error.
    """
    try:
        job_id = event['jobId']
        user_id = event.get('userId')
        table_name = os.environ['TABLE_NAME']
        table = dynamodb.Table(table_name)
        
        # 1. Handle Failure
        if event.get('status') == 'FAILED':
            error_info = event.get('error', {})
            error_msg = str(error_info)
            
            table.update_item(
                Key={'jobId': job_id},
                UpdateExpression="set #s = :s, #e = :e, #t = :t",
                ExpressionAttributeNames={'#s': 'status', '#e': 'error', '#t': 'timestamp'},
                ExpressionAttributeValues={
                    ':s': 'FAILED',
                    ':e': error_msg,
                    ':t': datetime.datetime.utcnow().isoformat()
                }
            )
            return {'status': 'FAILED', 'error': error_msg}

        # 2. Handle Success (Result already in S3 from Generator)
        if 'resultUrl' in event:
            result_url = event['resultUrl']
            timestamp = datetime.datetime.utcnow().isoformat()

            # Update Jobs Table
            table.put_item(
                Item={
                    'jobId': job_id,
                    'status': 'COMPLETED',
                    'resultUrl': result_url,
                    'timestamp': timestamp
                }
            )

            # Save to User Generations History
            if user_id:
                try:
                    gen_table_name = os.environ['USER_GENERATIONS_TABLE_NAME']
                    gen_table = dynamodb.Table(gen_table_name)
                    gen_table.put_item(
                        Item={
                            'userId': user_id,
                            'timestamp': timestamp,
                            'jobId': job_id,
                            'resultUrl': result_url
                        }
                    )
                except Exception as e:
                    print(f"Error saving generation history: {e}")

            return {'status': 'COMPLETED', 'resultUrl': result_url}

        # 3. Legacy/Fallback (If passed raw AI result, not used anymore but kept for safety)
        if 'aiResult' in event:
            ai_result = event['aiResult'] 
            bucket_name = os.environ['BUCKET_NAME']
            
            s3_key = f"results/{job_id}.json"
            s3_client.put_object(
                Bucket=bucket_name,
                Key=s3_key,
                Body=json.dumps(ai_result),
                ContentType='application/json'
            )
            
            result_url = f"https://{bucket_name}.s3.amazonaws.com/{s3_key}"
    
            table.put_item(
                Item={
                    'jobId': job_id,
                    'status': 'COMPLETED',
                    'resultUrl': result_url,
                    'timestamp': datetime.datetime.utcnow().isoformat()
                }
            )
            return {'status': 'COMPLETED', 'resultUrl': result_url}

    except Exception as e:
        print(f"Error in saver: {e}")
        raise e
