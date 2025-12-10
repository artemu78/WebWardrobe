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

PRICE_PER_CREDIT = 32

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

def get_user_info_from_token(event):
    """Extract user email and name from Google OAuth token if available.
    Returns a dict with keys 'email' and 'name' when found, otherwise None.
    """
    headers = event.get('headers', {})
    auth_header = headers.get('authorization') or headers.get('Authorization')
    if auth_header:
        token = auth_header.replace('Bearer ', '').strip()
        try:
            # Use userinfo endpoint instead of tokeninfo for better profile data
            url = "https://www.googleapis.com/oauth2/v3/userinfo"
            req = urllib.request.Request(url, headers={'Authorization': f"Bearer {token}"})
            with urllib.request.urlopen(req) as response:
                data = json.loads(response.read().decode())
                print(f"User info data keys: {list(data.keys())}")
                
                user_info = {}
                if 'email' in data:
                    user_info['email'] = data['email']
                if 'name' in data:
                    user_info['name'] = data['name']
                if 'picture' in data:
                    user_info['picture'] = data['picture']
                return user_info if user_info else None
        except Exception as e:
            print(f"User info extraction failed: {e}")
    # Fallback: no info available
    return None

def dispatcher_handler(event, context):
    """
    Handle POST /try-on requests: validate inputs, charge a credit, create a job record, and start a Step Functions execution to perform the try-on.
    
    Expects:
    - event['body'] JSON containing `itemUrl` (string) and `selfieId` (string).
    - Authorization via headers (Bearer token validated by get_user_id_from_token or x-user-id header).
    - Environment variables: USER_TABLE_NAME, TABLE_NAME, STATE_MACHINE_ARN.
    
    Behavior:
    - Verifies itemUrl, selfieId, and authenticated userId; returns 400 if any are missing.
    - Loads the user's profile from the USERS table and locates the selfie by id; returns 404 if profile or selfie is not found.
    - Treats missing `credits` as 5 for legacy users; returns 402 with code `INSUFFICIENT_CREDITS` if the user has zero or fewer credits.
    - Atomically decrements the user's credits by 1 using a conditional DynamoDB update; if the condition fails, returns 402 with code `INSUFFICIENT_CREDITS`.
    - Creates a job record in the jobs table with status `PROCESSING`, starts the Step Functions state machine with a payload containing jobId, userId, itemUrl, selfieUrl, and selfieId, and returns the jobId and executionArn on success.
    
    Returns:
    A dict suitable for an API Gateway response:
    - 200: {'jobId': <id>, 'executionArn': <arn>, 'message': 'Try-on job started'}
    - 400: missing parameters
    - 402: insufficient credits (includes 'code': 'INSUFFICIENT_CREDITS')
    - 404: user profile or selfie not found
    - 500: unexpected error with error message
    """
    credit_deducted = False
    user_id = None
    user_table = None

    try:
        body = json.loads(event.get('body', '{}'))
        item_url = body.get('itemUrl')
        selfie_id = body.get('selfieId')
        site_url = body.get('siteUrl')
        site_title = body.get('siteTitle')
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

        # Initialize profile if not found, creating with name and email if available
        if not user_profile:
            # Attempt to extract user info from token (email and name)
            user_info = get_user_info_from_token(event)
            new_profile = {
                'userId': user_id,
                'credits': 5,
                'images': []
            }
            if user_info:
                if 'email' in user_info:
                    new_profile['email'] = user_info['email']
                if 'name' in user_info:
                    new_profile['name'] = user_info['name']
                if 'picture' in user_info:
                    new_profile['picture'] = user_info['picture']
            # Store the new profile in DynamoDB
            user_table.put_item(Item=new_profile)
            user_profile = new_profile
            # Continue processing with the newly created profile
            # Also ensure name/email are stored if present in token (for existing profiles)
            if not user_info:
                user_info = get_user_info_from_token(event)
            if user_info:
                update_expr = []
                expr_attrs = {}
                if 'email' in user_info and 'email' not in user_profile:
                    update_expr.append('#e = :e')
                    expr_attrs[':e'] = user_info['email']
                if 'name' in user_info and 'name' not in user_profile:
                    update_expr.append('#n = :n')
                    expr_attrs[':n'] = user_info['name']
                if 'picture' in user_info and 'picture' not in user_profile:
                    update_expr.append('#p = :p')
                    expr_attrs[':p'] = user_info['picture']
                if update_expr:
                    update_expression = 'SET ' + ', '.join(update_expr)
                    expression_attribute_names = {}
                    if '#e' in update_expression:
                        expression_attribute_names['#e'] = 'email'
                    if '#n' in update_expression:
                        expression_attribute_names['#n'] = 'name'
                    if '#p' in update_expression:
                        expression_attribute_names['#p'] = 'picture'
                    user_table.update_item(
                        Key={'userId': user_id},
                        UpdateExpression=update_expression,
                        ExpressionAttributeNames=expression_attribute_names,
                        ExpressionAttributeValues=expr_attrs
                    )

        # Check credits
        credits = user_profile.get('credits', 0)

        # Correction: If credits key missing, give them 5 (legacy user or first time logic)
        if 'credits' not in user_profile:
            credits = 5
            # We will update it below

        if credits <= 0:
            return {
                'statusCode': 402,
                'body': json.dumps({
                    'error': 'Insufficient credits',
                    'code': 'INSUFFICIENT_CREDITS'
                })
            }
             
        images = user_profile.get('images', [])
        selfie_url = next((img['s3Url'] for img in images if img['id'] == selfie_id), None)
        
        if not selfie_url:
            return {'statusCode': 404, 'body': json.dumps({'error': 'Selfie not found'})}

        # Deduct credit
        try:
            user_table.update_item(
                Key={'userId': user_id},
                UpdateExpression="set credits = if_not_exists(credits, :start) - :dec",
                ConditionExpression="credits > :zero OR attribute_not_exists(credits)",
                ExpressionAttributeValues={
                    ':dec': 1,
                    ':start': 5, # If missing, start at 5 then minus 1
                    ':zero': 0
                }
            )
            credit_deducted = True
        except ClientError as e:
            if e.response['Error']['Code'] == 'ConditionalCheckFailedException':
                 return {
                    'statusCode': 402,
                    'body': json.dumps({
                        'error': 'Insufficient credits',
                        'code': 'INSUFFICIENT_CREDITS'
                    })
                }
            raise e

        job_id = str(uuid.uuid4())
        state_machine_arn = os.environ['STATE_MACHINE_ARN']

        # Input for the Step Function
        sfn_input = {
            'jobId': job_id,
            'userId': user_id,
            'itemUrl': item_url,
            'selfieUrl': selfie_url,
            'selfieId': selfie_id,
            'siteUrl': site_url,
            'siteTitle': site_title
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
        
        # Refund if deducted but failed to start
        if credit_deducted and user_id and user_table:
            try:
                print(f"Refunding credit for user {user_id} due to dispatcher error")
                user_table.update_item(
                    Key={'userId': user_id},
                    UpdateExpression="set credits = credits + :inc",
                    ExpressionAttributeValues={':inc': 1}
                )
            except Exception as refund_error:
                print(f"Failed to refund credit: {refund_error}")

        return {
            'statusCode': 500,
            'body': json.dumps({'error': str(e)})
        }

def profile_handler(event, context):
    """
    Handle authenticated user image and generation endpoints under /user/*.
    
    Supported routes and behavior:
    - GET /user/generations: return the authenticated user's generations, newest first.
    - POST /user/images/upload-url: generate presigned S3 upload URL(s) for an image (and optional thumbnail); returns upload URL(s), s3 key(s), and fileId.
    - POST /user/images: confirm an uploaded image, enforce a maximum of 5 images, append image metadata to the user's profile, and return the saved image id and URL.
    - GET /user/images: return the user's images and current credits (defaults to 5 when unset).
    - DELETE /user/images/{fileId}: delete an image and optional thumbnail from S3 and remove it from the user's profile.
    
    Parameters:
    - event (dict): API Gateway HTTP event containing path/rawPath, requestContext.http.method, headers, and body (JSON for POST requests). The handler expects an authenticated user identifier resolvable via get_user_id_from_token(event).
    - context: Lambda context object (unused by this handler).
    
    Returns:
    A dict representing an HTTP response with keys:
    - statusCode (int): HTTP status code (e.g., 200, 400, 401, 404, 500, 402 for insufficient credits).
    - body (str): JSON-encoded response body containing data or an error message.
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

                # Ensure all required fields are present
                generations = []
                for item in items:
                    generations.append({
                        'resultUrl': item.get('resultUrl'),
                        'itemUrl': item.get('itemUrl'),
                        'siteUrl': item.get('siteUrl'),
                        'timestamp': item.get('timestamp'),
                        'jobId': item.get('jobId'),
                        'siteTitle': item.get('siteTitle')
                    })

                return {
                    'statusCode': 200,
                    'body': json.dumps({'generations': generations})
                }
            except Exception as e:
                print(f"Error fetching generations: {e}")
                return {'statusCode': 500, 'body': json.dumps({'error': str(e)})}

        # DELETE /user/generations/{jobId}
        elif method == 'DELETE' and 'generations' in path:
            parts = path.split('/')
            if len(parts) < 4:
                 return {'statusCode': 400, 'body': json.dumps({'error': 'Invalid path'})}
            
            job_id = parts[-1]
            generations_table_name = os.environ['USER_GENERATIONS_TABLE_NAME']
            gen_table = dynamodb.Table(generations_table_name)

            # We need timestamp to delete, so we must query first
            try:
                # Query all user generations to find the one with matching jobId
                # This is not efficient for large datasets but fine for per-user lists
                response = gen_table.query(
                    KeyConditionExpression=boto3.dynamodb.conditions.Key('userId').eq(user_id)
                )
                items = response.get('Items', [])
                target_gen = next((g for g in items if g.get('jobId') == job_id), None)

                if not target_gen:
                    return {'statusCode': 404, 'body': json.dumps({'error': 'Generation not found'})}

                # Delete from S3
                # resultUrl format: https://{bucket}.s3.amazonaws.com/{key}
                result_url = target_gen.get('resultUrl', '')
                if result_url:
                    try:
                        # Extract key from URL
                        # Assuming standard S3 URL format
                        s3_key = result_url.split('.amazonaws.com/')[-1]
                        s3_client.delete_object(Bucket=bucket_name, Key=s3_key)
                    except Exception as e:
                        print(f"Failed to delete generation from S3: {e}")

                # Delete from DynamoDB
                gen_table.delete_item(
                    Key={
                        'userId': user_id,
                        'timestamp': target_gen['timestamp']
                    }
                )

                return {
                    'statusCode': 200,
                    'body': json.dumps({'message': 'Generation deleted'})
                }

            except Exception as e:
                print(f"Error deleting generation: {e}")
                return {'statusCode': 500, 'body': json.dumps({'error': str(e)})}

        # GET /user/profile - Returns user profile info (name, picture, email, credits)
        elif method == 'GET' and path.endswith('/profile'):
            response = user_table.get_item(Key={'userId': user_id})
            item = response.get('Item')
            
            # Always fetch fresh user info from Google token
            user_info = get_user_info_from_token(event)

            if not item:
                # Create new profile with Google user info
                item = {
                    'userId': user_id,
                    'credits': 5,
                    'images': []
                }
                if user_info:
                    if 'email' in user_info:
                        item['email'] = user_info['email']
                    if 'name' in user_info:
                        item['name'] = user_info['name']
                    if 'picture' in user_info:
                        item['picture'] = user_info['picture']
                
                user_table.put_item(Item=item)
            
            elif user_info:
                # Update existing profile with any missing fields from Google
                update_expr = []
                expr_attrs = {}
                expr_names = {}
                
                # Always update name and picture from Google (they might change)
                if 'name' in user_info:
                    update_expr.append('#n = :n')
                    expr_attrs[':n'] = user_info['name']
                    expr_names['#n'] = 'name'
                    item['name'] = user_info['name']
                
                if 'picture' in user_info:
                    update_expr.append('#p = :p')
                    expr_attrs[':p'] = user_info['picture']
                    expr_names['#p'] = 'picture'
                    item['picture'] = user_info['picture']
                
                if 'email' in user_info:
                    update_expr.append('#e = :e')
                    expr_attrs[':e'] = user_info['email']
                    expr_names['#e'] = 'email'
                    item['email'] = user_info['email']
                
                if update_expr:
                    user_table.update_item(
                        Key={'userId': user_id},
                        UpdateExpression='SET ' + ', '.join(update_expr),
                        ExpressionAttributeNames=expr_names,
                        ExpressionAttributeValues=expr_attrs
                    )

            credits = int(item.get('credits', 5))
            return {
                'statusCode': 200,
                'body': json.dumps({
                    'name': item.get('name'),
                    'picture': item.get('picture'),
                    'email': item.get('email'),
                    'credits': credits,
                    'userId': item.get('userId'),
                    'images': item.get('images', [])
                }, default=str)
            }

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
                'body': json.dumps(new_image_item)
            }

        # GET /user/images
        elif method == 'GET':
            response = user_table.get_item(Key={'userId': user_id})
            item = response.get('Item')
            
            # Check if we need to fetch user info (if profile missing or missing fields)
            user_info = None
            if not item or ('email' not in item or 'name' not in item):
                user_info = get_user_info_from_token(event)

            if not item:
                # Create new profile
                item = {
                    'userId': user_id,
                    'credits': 5,
                    'images': []
                }
                if user_info:
                    if 'email' in user_info:
                        item['email'] = user_info['email']
                    if 'name' in user_info:
                        item['name'] = user_info['name']
                    if 'picture' in user_info:
                        item['picture'] = user_info['picture']
                
                user_table.put_item(Item=item)
            
            elif user_info:
                # Update existing profile if email/name missing and available in token
                update_expr = []
                expr_attrs = {}
                expr_names = {}
                
                if 'email' in user_info and 'email' not in item:
                    update_expr.append('#e = :e')
                    expr_attrs[':e'] = user_info['email']
                    expr_names['#e'] = 'email'
                    item['email'] = user_info['email']
                
                if 'name' in user_info and 'name' not in item:
                    update_expr.append('#n = :n')
                    expr_attrs[':n'] = user_info['name']
                    expr_names['#n'] = 'name'
                    item['name'] = user_info['name']
                
                if 'picture' in user_info and 'picture' not in item:
                    update_expr.append('#p = :p')
                    expr_attrs[':p'] = user_info['picture']
                    expr_names['#p'] = 'picture'
                    item['picture'] = user_info['picture']
                
                if update_expr:
                    user_table.update_item(
                        Key={'userId': user_id},
                        UpdateExpression='SET ' + ', '.join(update_expr),
                        ExpressionAttributeNames=expr_names,
                        ExpressionAttributeValues=expr_attrs
                    )

            images = item.get('images', [])
            # Return credits as well, default to 5 if not set
            credits = int(item.get('credits', 5))
            return {
                'statusCode': 200,
                'body': json.dumps({
                    'images': images,
                    'credits': credits,
                    'name': item.get('name'),
                    'picture': item.get('picture')
                }, default=str) # handle Decimal if any
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
        user_id = event['userId']
        item_url = event['itemUrl']
        selfie_url = event['selfieUrl']
        selfie_id = event.get('selfieId')
        site_url = event.get('siteUrl')
        site_title = event.get('siteTitle')
        
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
                    {"text": "Blend Image A and Image B. In the result, the person from Image A should be seamlessly wearing the clothes from Image B. Maintain the facial features, pose, and lighting from Image A, but precisely transfer the clothing, textures, and colors from Image B onto the person. Use a photorealistic style, with natural shadows and details. Keep the background from Image A. For reference inputs: Image A is the source character, Image B provides the clothing."},
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
        s3_key = f"results/{user_id}/{job_id}.png"
        
        s3_client.put_object(
            Bucket=bucket_name,
            Key=s3_key,
            Body=image_data,
            ContentType='image/png'
        )
        
        result_url = f"https://{bucket_name}.s3.amazonaws.com/{s3_key}"
        
        return {
            'jobId': job_id,
            'userId': user_id,
            'itemUrl': item_url,
            'siteUrl': site_url,
            'siteTitle': site_title,
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
            # Refund credit
            if user_id:
                try:
                    user_table_name = os.environ['USER_TABLE_NAME']
                    user_table = dynamodb.Table(user_table_name)
                    print(f"Refunding credit for user {user_id} due to job failure")
                    user_table.update_item(
                        Key={'userId': user_id},
                        UpdateExpression="set credits = credits + :inc",
                        ExpressionAttributeValues={':inc': 1}
                    )
                except Exception as refund_error:
                    print(f"Failed to refund credit: {refund_error}")

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
                    item_url = event.get('itemUrl')
                    site_url = event.get('siteUrl')
                    site_title = event.get('siteTitle')
                    gen_table_name = os.environ['USER_GENERATIONS_TABLE_NAME']
                    gen_table = dynamodb.Table(gen_table_name)
                    gen_table.put_item(
                        Item={
                            'userId': user_id,
                            'timestamp': timestamp,
                            'jobId': job_id,
                            'resultUrl': result_url,
                            'itemUrl': item_url,
                            'siteUrl': site_url,
                            'siteTitle': site_title
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

import hmac
import hashlib


def payment_link_handler(event, context):
    """
    Handle POST /payment/link requests: generate a signed Prodamus payment URL.
    
    Expects:
    - event['body'] JSON containing `tariffName` (string) and `lang` (string).
    - Authorization via headers (Bearer token validated by get_user_id_from_token).
    - Environment variables: PRODAMUS_SECRET_KEY.
    
    Returns:
    - 200: {'url': <signed_payment_url>}
    - 400: missing parameters
    - 401: unauthorized
    - 500: unexpected error
    """
    try:
        user_id = get_user_id_from_token(event)
        if not user_id:
             return {'statusCode': 401, 'body': json.dumps({'error': 'Unauthorized'})}

        body = json.loads(event.get('body', '{}'))
        tariff_name = body.get('tariffName')
        lang = body.get('lang', 'en')
        
        # Define price per credit based on language (server-side validation)
        if lang == 'ru':
            price_per_credit = 32
        else:
            price_per_credit = 0.4
        
        if not tariff_name:
            return {'statusCode': 400, 'body': json.dumps({'error': 'Missing tariffName'})}

        # Fetch user email if available
        user_table_name = os.environ['USER_TABLE_NAME']
        user_table = dynamodb.Table(user_table_name)
        user_profile = user_table.get_item(Key={'userId': user_id}).get('Item', {})
        user_email = user_profile.get('email')

        # Define Tariff Details
        price = 0
        credits = 0
        name = "none"
        sku = "none"

        if tariff_name == 'On the go':
            credits = 10
            price = credits * price_per_credit
            name = f"WebWardrobe: {credits} Credits"
            sku = "on_the_go"
        elif tariff_name == 'Starter':
            credits = 25
            price = credits * price_per_credit
            name = f"WebWardrobe: {credits} Credits"
            sku = "starter"
        elif tariff_name == 'Standard':
            credits = 60
            # Apply discount for Standard: 60 credits for the price of 50
            price = 50 * price_per_credit
            name = f"WebWardrobe: {credits} Credits"
            sku = "standard"
        else:
            return {'statusCode': 400, 'body': json.dumps({'error': 'Invalid tariff'})}

        products = [
            {
                "name": name,
                "price": price,
                "quantity": 1,
                "tax": "none",
                "type": "service",
                "sku": sku
            }
        ]

        # Constants
        PAYMENT_URL_RU = "https://web-wardrobe.payform.ru/"
        PAYMENT_URL_EN = "https://web-wardrobe-eng.payform.ru/" # Same for now, or change if needed
        PRODAMUS_SYS = "webwardrobe" # Replace with actual sys if different
        
        # Construct Params
        params = {
            "do": "pay",
            "products": products, # Will be normalized to list of dicts
            "customer_extra": user_id,
            "urlSuccess": os.environ.get('PRODAMUS_SUCCESS_URL', 'https://web-wardrobe.netlify.app/?payment=success'), # Hardcoded or from env
            "sys": PRODAMUS_SYS
        }
        
        if user_email:
            params["customer_email"] = user_email

        # 1. Normalize and Sort
        def normalize_and_sort(obj):
            if isinstance(obj, dict):
                return {k: normalize_and_sort(v) for k, v in sorted(obj.items())}
            elif isinstance(obj, list):
                return [normalize_and_sort(x) for x in obj]
            else:
                return str(obj)

        normalized_params = normalize_and_sort(params)

        # 2. Serialize to JSON with slash escaping
        # Python's json.dumps escapes / as \/ if we use a custom encoder or replace
        # Standard json.dumps does NOT escape forward slashes by default.
        # We need to mimic the behavior: replace / with \/
        json_str = json.dumps(normalized_params, separators=(',', ':'), ensure_ascii=False)
        # Prodamus expects slashes to be escaped? The JS code did `replace(/\//g, '\\/')`.
        # Let's do the same.
        json_str = json_str.replace('/', '\\/')

        # 3. Sign
        secret_key = os.environ.get('PRODAMUS_SECRET_KEY')
        if not secret_key:
            print("ERROR: PRODAMUS_SECRET_KEY is missing")
            return {'statusCode': 500, 'body': json.dumps({'error': 'Internal server configuration error'})}
        
        signature = hmac.new(
            secret_key.encode('utf-8'),
            json_str.encode('utf-8'),
            hashlib.sha256
        ).hexdigest()

        # 4. Construct Final URL
        # We need to send params as GET parameters.
        # `products` must be JSON stringified.
        query_params = {
            "do": "pay",
            "products": json.dumps(products, separators=(',', ':'), ensure_ascii=False),
            "customer_extra": user_id,
            "urlSuccess": os.environ.get('PRODAMUS_SUCCESS_URL', 'https://web-wardrobe.netlify.app/?payment=success'),
            "sys": PRODAMUS_SYS,
            "sign": signature
        }
        if user_email:
            query_params["customer_email"] = user_email

        base_url = PAYMENT_URL_RU if lang == 'ru' else PAYMENT_URL_EN
        final_url = f"{base_url}?{urllib.parse.urlencode(query_params)}"

        return {
            'statusCode': 200,
            'body': json.dumps({'url': final_url})
        }

    except Exception as e:
        print(f"Error generating payment link: {e}")
        return {'statusCode': 500, 'body': json.dumps({'error': str(e)})}

def payment_webhook_handler(event, context):
    """
    Handle Prodamus payment webhook notifications.
    Verifies signature and updates user credits.
    """
    try:
        print("Received webhook event:", json.dumps(event))
        
        secret_key = os.environ.get('PRODAMUS_SECRET_KEY')
        if not secret_key:
            print("Error: PRODAMUS_SECRET_KEY not configured")
            return {'statusCode': 500, 'body': 'Configuration error'}

        headers = event.get('headers', {})
        # Headers can be case-insensitive
        sign_header = headers.get('Sign') or headers.get('sign')
        
        if not sign_header:
            print("Error: Missing Sign header")
            return {'statusCode': 403, 'body': 'Missing signature'}

        # Parse body
        body_str = event.get('body', '')
        content_type = headers.get('content-type', '') or headers.get('Content-Type', '')

        data = {}
        if 'application/json' in content_type:
            data = json.loads(body_str)
        elif 'application/x-www-form-urlencoded' in content_type:
            # Parse form data
            parsed = urllib.parse.parse_qs(body_str)
            # parse_qs returns lists, we need single values
            for k, v in parsed.items():
                data[k] = v[0]
        else:
             # Fallback try JSON
            try:
                data = json.loads(body_str)
            except:
                pass

        if not data:
             print("Error: Empty or unparseable body")
             return {'statusCode': 400, 'body': 'Invalid body'}

        # Verify Signature
        # 1. Sort keys alphabetically
        # 2. Serialize to JSON (separators=(',',':'), ensure_ascii=False)
        # 3. HMAC-SHA256
        
        # We need to normalize data values to strings as well?
        # The documentation says: "multi-level sorting of the array by keys"
        # And "convert all data to strings"
        


        # Important: We must replicate exactly how Prodamus constructs the string to sign.
        # If they send JSON, we should probably just sort the JSON object.
        # If they send Form Data, we have a dict of strings.
        
        # Note: The python example from Prodamus docs (if available) would be best.
        # Based on previous search: "sort callback data by keys, serialize to JSON"
        def recursive_sort(obj):
            if isinstance(obj, dict):
                return {k: recursive_sort(v) for k, v in sorted(obj.items())}
            elif isinstance(obj, list):
                return [recursive_sort(x) for x in obj]
            else:
                return str(obj) # Convert all values to string for consistency
        
        sorted_data_recursive = recursive_sort(data)
        
        # Serialize
        # separators=(',', ':') removes whitespace
        # ensure_ascii=False allows non-ASCII chars (e.g. Russian)
        json_str = json.dumps(sorted_data_recursive, separators=(',', ':'), ensure_ascii=False)
        
        # Prodamus might escape slashes too?
        # "In the resulting JSON string, escape all / characters." - from User Request for LINK generation.
        # Does it apply to Webhook verification? Usually yes, the algorithm is symmetric.
        json_str = json_str.replace('/', '\\/')
        
        my_signature = hmac.new(
            secret_key.encode('utf-8'),
            json_str.encode('utf-8'),
            hashlib.sha256
        ).hexdigest()
        
        if my_signature.lower() != sign_header.lower():
            print(f"Signature mismatch. Received: {sign_header}, Calculated: {my_signature}")
            print(f"String used for signature: {json_str}")
            return {'statusCode': 403, 'body': 'Signature mismatch'}

        # Process Payment
        payment_status = data.get('payment_status')
        if payment_status != 'success':
            print(f"Payment status is {payment_status}, ignoring.")
            return {'statusCode': 200, 'body': 'Ignored'}

        # Extract User ID
        # We passed it in 'customer_extra'
        user_id = data.get('customer_extra')
        if not user_id:
            print("Error: No user_id in customer_extra")
            return {'statusCode': 400, 'body': 'Missing user_id'}

        # Calculate Credits
        # 1 credit = PRICE_PER_CREDIT RUB
        amount = float(data.get('sum', 0))
        
        # Try to determine credits from SKU first
        sku = data.get('sku') or data.get('item_code')
        # Check nested products if available
        if not sku and 'products' in data:
            try:
                products_list = data['products']
                if isinstance(products_list, list) and len(products_list) > 0:
                    sku = products_list[0].get('sku')
            except:
                pass

        if sku == 'standard':
            credits_to_add = 60
        elif sku == 'starter':
            credits_to_add = 25
        elif sku == 'on_the_go':
            credits_to_add = 10
        else:
            # Fallback to amount-based calculation
            # Check for specific discounted amounts (approximate)
            if abs(amount - 1600) < 50: # Standard (1600 RUB)
                credits_to_add = 60
            elif abs(amount - 800) < 25: # Starter (800 RUB)
                credits_to_add = 25
            elif abs(amount - 320) < 10: # On the go (320 RUB)
                credits_to_add = 10
            else:
                credits_to_add = int(amount / PRICE_PER_CREDIT)
        
        if credits_to_add <= 0:
            print("Warning: Credits to add is 0")
            return {'statusCode': 200, 'body': 'No credits to add'}

        print(f"Adding {credits_to_add} credits to user {user_id} for amount {amount}")

        # Update DynamoDB with Idempotency Check
        user_table_name = os.environ['USER_TABLE_NAME']
        user_table = dynamodb.Table(user_table_name)
        
        payment_id = data.get('payment_id') or data.get('order_id')
        
        try:
            if payment_id:
                user_table.update_item(
                    Key={'userId': user_id},
                    UpdateExpression="set credits = if_not_exists(credits, :start) + :inc, processed_payments = list_append(if_not_exists(processed_payments, :empty_list), :new_pid_list)",
                    ConditionExpression="NOT contains(processed_payments, :pid)",
                    ExpressionAttributeValues={
                        ':inc': credits_to_add,
                        ':start': 5,
                        ':empty_list': [],
                        ':new_pid_list': [str(payment_id)],
                        ':pid': str(payment_id)
                    }
                )
            else:
                # Fallback without idempotency
                user_table.update_item(
                    Key={'userId': user_id},
                    UpdateExpression="set credits = if_not_exists(credits, :start) + :inc",
                    ExpressionAttributeValues={
                        ':inc': credits_to_add,
                        ':start': 5
                    }
                )
        except ClientError as e:
            if e.response['Error']['Code'] == 'ConditionalCheckFailedException':
                print(f"Payment {payment_id} already processed")
                return {'statusCode': 200, 'body': 'Already processed'}
            else:
                raise e

        return {'statusCode': 200, 'body': 'Success'}

    except Exception as e:
        print(f"Error in webhook handler: {e}")
        return {'statusCode': 500, 'body': str(e)}