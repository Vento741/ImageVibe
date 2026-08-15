# Flux-2 - Pro Text to Image

## OpenAPI Specification

```yaml
openapi: 3.0.1
info:
  title: ''
  description: ''
  version: 1.0.0
paths:
  /api/v1/jobs/createTask:
    post:
      summary: Flux-2 - Pro Text to Image
      deprecated: false
      description: >
        High-quality photorealistic image generation powered by Flux-2's
        advanced AI model


        ## Query Task Status


        After submitting a task, use the unified query endpoint to check
        progress and retrieve results:


        <Card title="Get Task Details" icon="lucide-search"
        href="/market/common/get-task-detail">
          Learn how to query task status and retrieve generation results
        </Card>


        ::: tip[]

        For production use, we recommend using the `callBackUrl` parameter to
        receive automatic notifications when generation completes, rather than
        polling the status endpoint.

        :::


        ## Related Resources


        <CardGroup cols={2}>
          <Card title="Market Overview" icon="lucide-store" href="/market/quickstart">
            Explore all available models
          </Card>
          <Card title="Common API" icon="lucide-cog" href="/common-api/get-account-credits">
            Check credits and account usage
          </Card>
        </CardGroup>
      operationId: flux-2-pro-text-to-image
      tags:
        - docs/en/Market/Image    Models/Flux-2
      parameters: []
      requestBody:
        content:
          application/json:
            schema:
              type: object
              required:
                - model
              properties:
                model:
                  type: string
                  enum:
                    - flux-2/pro-text-to-image
                  default: flux-2/pro-text-to-image
                  description: |-
                    The model name to use for generation. Required field.

                    - Must be `flux-2/pro-text-to-image` for this endpoint
                  examples:
                    - flux-2/pro-text-to-image
                callBackUrl:
                  type: string
                  format: uri
                  description: >-
                    The URL to receive generation task completion updates.
                    Optional but recommended for production use.


                    - System will POST task status and results to this URL when
                    generation completes

                    - Callback includes generated content URLs and task
                    information

                    - Your callback endpoint should accept POST requests with
                    JSON payload containing results

                    - Alternatively, use the Get Task Details endpoint to poll
                    task status

                    - To ensure callback security, see [Webhook Verification
                    Guide](/common-api/webhook-verification) for signature
                    verification implementation
                  examples:
                    - https://your-domain.com/api/callback
                input:
                  type: object
                  description: Input parameters for the generation task
                  properties:
                    prompt:
                      description: ' Must be between 3 and 5000 characters. (Max length: 5000 characters)'
                      type: string
                      maxLength: 5000
                      examples:
                        - >-
                          Hyperrealistic supermarket blister pack on clean olive
                          green surface. No shadows. Inside: bright pink 3D
                          letters spelling "FLUX.2" pressing against stretched
                          plastic film, creating realistic deformation and
                          reflective highlights. Bottom left corner: barcode
                          sticker with text "GENERATE NOW" and "PLAYGROUND".
                          Plastic shows tension wrinkles and realistic shine
                          where stretched by the volumetric letters.
                    aspect_ratio:
                      type: string
                      description: >-
                        Aspect ratio for the generated image. Select 'auto' to
                        match the first input image ratio (requires input
                        image).
                      enum:
                        - '1:1'
                        - '4:3'
                        - '3:4'
                        - '16:9'
                        - '9:16'
                        - '3:2'
                        - '2:3'
                      default: '1:1'
                      examples:
                        - '1:1'
                      x-apidog-enum:
                        - value: '1:1'
                          name: ''
                          description: ''
                        - value: '4:3'
                          name: ''
                          description: ''
                        - value: '3:4'
                          name: ''
                          description: ''
                        - value: '16:9'
                          name: ''
                          description: ''
                        - value: '9:16'
                          name: ''
                          description: ''
                        - value: '3:2'
                          name: ''
                          description: ''
                        - value: '2:3'
                          name: ''
                          description: ''
                    resolution:
                      description: Output image resolution.
                      type: string
                      enum:
                        - 1K
                        - 2K
                      default: 1K
                      examples:
                        - 1K
                    nsfw_checker:
                      type: boolean
                      description: >-
                        Defaults to false. You can set it to false based on your
                        needs. If set to false, our content filtering will be
                        disabled, and all results will be returned directly by
                        the model itself.

                        Note: There is no guarantee that everything can be
                        filtered out; if you are not satisfied with the results,
                        you will need to make your own arrangements.
                  required:
                    - prompt
                    - aspect_ratio
                    - resolution
                  x-apidog-orders:
                    - prompt
                    - aspect_ratio
                    - resolution
                    - 01KWKKKH6B3CDM7AGTZXZCPH5P
                  x-apidog-refs:
                    01KWKKKH6B3CDM7AGTZXZCPH5P:
                      $ref: '#/components/schemas/nsfw_checker'
                  x-apidog-ignore-properties:
                    - nsfw_checker
              x-apidog-orders:
                - model
                - callBackUrl
                - input
              x-apidog-ignore-properties: []
            example:
              model: flux-2/pro-text-to-image
              callBackUrl: https://your-domain.com/api/callback
              input:
                prompt: >-
                  Hyperrealistic supermarket blister pack on clean olive green
                  surface. No shadows. Inside: bright pink 3D letters spelling
                  "FLUX.2" pressing against stretched plastic film, creating
                  realistic deformation and reflective highlights. Bottom left
                  corner: barcode sticker with text "GENERATE NOW" and
                  "PLAYGROUND". Plastic shows tension wrinkles and realistic
                  shine where stretched by the volumetric letters.
                aspect_ratio: '1:1'
                resolution: 1K
                nsfw_checker: false
      responses:
        '200':
          description: Request successful
          content:
            application/json:
              schema:
                allOf:
                  - $ref: '#/components/schemas/ApiResponse'
              example:
                code: 200
                msg: success
                data:
                  taskId: task_flux-2_1765175072483
          headers: {}
          x-apidog-name: ''
      security:
        - BearerAuth: []
          x-apidog:
            schemeGroups:
              - id: kn8M4YUlc5i0A0179ezwx
                schemeIds:
                  - BearerAuth
            required: true
            use:
              id: kn8M4YUlc5i0A0179ezwx
            scopes:
              kn8M4YUlc5i0A0179ezwx:
                BearerAuth: []
      callbacks:
        onImageGenerated:
          '{$request.body#/callBackUrl}':
            post:
              summary: Image Generation Callback
              description: >-
                When the image generation task is completed, the system sends
                the result to your callback URL via a POST request.
              requestBody:
                required: true
                content:
                  application/json:
                    schema:
                      type: object
                      properties:
                        code:
                          type: integer
                          description: >-
                            Status code


                            - **200**: Success - Image generation task completed
                            successfully

                            - **400**: Invalid request parameters or content
                            violates policy

                            - **500**: Internal error. Please try again later.

                            - **501**: Failed - Image generation task failed
                          enum:
                            - 200
                            - 400
                            - 500
                            - 501
                        msg:
                          type: string
                          description: Status message
                          example: Playground task completed successfully.
                        data:
                          type: object
                          properties:
                            completeTime:
                              type: integer
                              format: int64
                              description: >-
                                Task completion time, represented as a Unix
                                timestamp in milliseconds
                              example: 1786430358000
                            costTime:
                              type: integer
                              description: Task duration in seconds
                              example: 26
                            createTime:
                              type: integer
                              format: int64
                              description: >-
                                Task creation time, represented as a Unix
                                timestamp in milliseconds
                              example: 1786430330000
                            creditsConsumed:
                              type: number
                              format: double
                              description: Number of credits consumed by the task
                              example: 5
                            model:
                              type: string
                              description: Image generation model used for the task
                              example: flux-2/pro-text-to-image
                            param:
                              type: string
                              description: >-
                                Parameters submitted when creating the task, in
                                JSON string format
                              example: >-
                                {"input":"{\"aspect_ratio\":\"1:1\",\"prompt\":\"Hyperrealistic
                                supermarket blister pack on a clean olive-green
                                surface. No shadows. Inside, bright pink 3D
                                letters spelling \\\"FLUX.2\\\" press against
                                stretched plastic film, creating realistic
                                deformation and reflective highlights. In the
                                bottom-left corner, include a barcode sticker
                                with the text \\\"GENERATE NOW\\\" and
                                \\\"PLAYGROUND\\\". The plastic shows tension
                                wrinkles and realistic shine where stretched by
                                the volumetric
                                letters.\",\"resolution\":\"1K\",\"nsfw_checker\":false}","callBackUrl":"https://webhook.uutool.cn/5f723555-ec59-4b8f-8feb-bed810982785","model":"flux-2/pro-text-to-image"}
                            resultJson:
                              type: string
                              description: >-
                                Image generation result in JSON string format.
                                resultUrls contains the list of generated image
                                URLs.
                              example: >-
                                {"resultUrls":["https://tempfile.aiquickdraw.com/h/e0af60383dfdb1d6bfb6bd40d9e6f891_1786430355.png"]}
                            state:
                              type: string
                              description: Task status
                              enum:
                                - success
                                - fail
                              example: success
                            taskId:
                              type: string
                              description: Task ID
                              example: e0af60383dfdb1d6bfb6bd40d9e6f891
                            updateTime:
                              type: integer
                              format: int64
                              description: >-
                                Last task update time, represented as a Unix
                                timestamp in milliseconds
                              example: 1786430358000
              responses:
                '200':
                  description: Callback received successfully
      x-apidog-folder: docs/en/Market/Image    Models/Flux-2
      x-apidog-status: released
      x-run-in-apidog: https://app.apidog.com/web/project/1184766/apis/api-28506365-run
components:
  schemas:
    nsfw_checker:
      type: object
      properties:
        nsfw_checker:
          type: boolean
          description: >-
            Defaults to false. You can set it to false based on your needs. If
            set to false, our content filtering will be disabled, and all
            results will be returned directly by the model itself.

            Note: There is no guarantee that everything can be filtered out; if
            you are not satisfied with the results, you will need to make your
            own arrangements.
      x-apidog-orders:
        - nsfw_checker
      x-apidog-ignore-properties: []
      x-apidog-folder: ''
    ApiResponse:
      type: object
      properties:
        code:
          type: integer
          description: >-
            Response status code


            - **200**: Success - Request has been processed successfully

            - **401**: Unauthorized - Authentication credentials are missing or
            invalid

            - **402**: Insufficient Credits - Account does not have enough
            credits to perform the operation

            - **404**: Not Found - The requested resource or endpoint does not
            exist

            - **422**: Validation Error - The request parameters failed
            validation checks

            - **429**: Rate Limited - Request limit has been exceeded for this
            resource

            - **433**: Request Limit - Sub-key Usage Exceeds Limit

            - **455**: Service Unavailable - System is currently undergoing
            maintenance

            - **500**: Server Error - An unexpected error occurred while
            processing the request

            - **501**: Generation Failed - Content generation task failed

            - **505**: Feature Disabled - The requested feature is currently
            disabled
          enum:
            - 200
            - 401
            - 402
            - 404
            - 422
            - 429
            - 433
            - 455
            - 500
            - 501
            - 505
          x-apidog-enum:
            - value: 200
              name: ''
              description: ''
            - value: 401
              name: ''
              description: ''
            - value: 402
              name: ''
              description: ''
            - value: 404
              name: ''
              description: ''
            - value: 422
              name: ''
              description: ''
            - value: 429
              name: ''
              description: ''
            - value: 433
              name: ''
              description: ''
            - value: 455
              name: ''
              description: ''
            - value: 500
              name: ''
              description: ''
            - value: 501
              name: ''
              description: ''
            - value: 505
              name: ''
              description: ''
        msg:
          type: string
          description: Response message, error description when failed
          examples:
            - success
        data:
          type: object
          properties:
            taskId:
              type: string
              description: >-
                Task ID, can be used with Get Task Details endpoint to query
                task status
          x-apidog-orders:
            - taskId
          required:
            - taskId
          x-apidog-ignore-properties: []
      x-apidog-orders:
        - code
        - msg
        - data
      title: response not with recordId
      required:
        - data
      x-apidog-ignore-properties: []
      x-apidog-folder: ''
  securitySchemes:
    BearerAuth:
      type: bearer
      scheme: bearer
      bearerFormat: API Key
      description: >-
        All API requests require a Bearer Token. Add the header `Authorization:
        Bearer YOUR_API_KEY` to authenticate requests.
    BearerAuth1:
      type: bearer
      scheme: bearer
      bearerFormat: API Key
      description: >-
        所有 API 请求都需要 Bearer Token。请在请求头中添加 `Authorization: Bearer YOUR_API_KEY`
        进行身份验证。
servers:
  - url: https://api.kie.ai
    description: 正式环境
security:
  - BearerAuth: []
    x-apidog:
      schemeGroups:
        - id: kn8M4YUlc5i0A0179ezwx
          schemeIds:
            - BearerAuth
      required: true
      use:
        id: kn8M4YUlc5i0A0179ezwx
      scopes:
        kn8M4YUlc5i0A0179ezwx:
          BearerAuth: []

```
