# WebWardrobe
Typescript powered Chrome Extension. Gemini API wrapper for user to try on clothes virtually.

```mermaid
flowchart TD

    subgraph API[API Gateway (HTTP API)]
        API_TryOn[/POST /try-on/]
        API_Upload[/POST /user/images/upload-url/]
        API_Confirm[/POST /user/images/]
        API_List[/GET /user/images/]
        API_Delete[/DELETE /user/images/{fileId}/]
        API_Status[/GET /status/{jobId}/]
    end

    subgraph L1[Lambdas]
        Dispatcher[DispatcherFunction]
        Profile[ProfileFunction]
        Status[StatusFunction]
        Generator[GeneratorFunction]
        Saver[ResultSaverFunction]
    end

    subgraph DB[DynamoDB]
        Jobs[(TryOnJobsTable)]
        Profiles[(UserProfilesTable)]
    end

    S3Bucket[(S3 TryOnBucket)]

    subgraph SF[Step Function: TryOnOrchestrator]
        GStep[Generate Image Task → GeneratorFunction]
        SStep[Save Result Task → ResultSaverFunction]
        HTTPTask[HTTP Task → Nano-Banana API]
    end

    API_TryOn --> Dispatcher
    API_Upload --> Profile
    API_Confirm --> Profile
    API_List --> Profile
    API_Delete --> Profile
    API_Status --> Status

    Dispatcher --> Jobs
    Dispatcher --> Profiles
    Profile --> Profiles
    Profile --> S3Bucket
    Status --> Jobs

    Dispatcher --> SF

    SF --> GStep
    GStep --> Generator
    Generator --> S3Bucket

    SF --> HTTPTask
    HTTPTask -->|uses| ApiConnection[(EventBridge Connection)]

    SF --> SStep
    SStep --> Saver
    Saver --> Jobs
    Saver --> S3Bucket
```
    