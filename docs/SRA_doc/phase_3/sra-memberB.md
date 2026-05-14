2.2. Business function diagram

2.2.1. Novel management (Author)

![image](./images/memberB/image1.png)

3.2. Business process

3.2.2. Process of publish new novels

a. Publish a new novel

![image](./images/memberB/image2.png)

Figure : Process of author request to publish a new novel

b. Publish new chapter

![image](./images/memberB/image3.png)

Figure : Process of author request to publish a new chapter

4. Use Case Specifications

4.2. Novel management

4.2.1. UC: Publish a new novel

a. Activity diagram

![image](./images/memberB/image4.png)

b. Use case description

| Objective | This function allows authors to publish a new novel on the platform |
| Actor | Author, System, AI System, Admin |
| Trigger | Author wants to publish a new novel |
| Pre-condition | Author has an account in the system and logged in successfully |
| Post-condition | - Novel is published on the platform |

| Step | Basic Flow | Exception Flow | Alternative Flow |
| 1 | Author clicks "Truyện của tôi" – System displays author's my story interface. Author clicks "Thêm truyện mới" – System displays add story interface |  |  |
| 2 | Author fills novel's information (title, description, genre, etc.) | 2a. System detects validation errors (Title ≥ 255 characters OR Description < 500 characters) 2a1. System displays message requiring user to fill correctly 2a2. Author re-fills the information |  |
| 3 | System validates information and passes to AI System to check for content violations | 3a. AI System detects violation of information 3a1. System notifies author of the violation 3a2. Author edits and re-submits the information |  |
| 4 | Author clicks "Tiếp theo" – System displays add chapter content interface |  |  |
| 5 | Author fills content for chapters – System implements UC Publish new chapter for each chapter | 5a. Chapter content fails UC Publish new chapter validation 5a1. Author re-edits the chapter content |  |
| 6 | Author clicks "Lưu tạm" – System checks if number of chapters meets requirement (≥ 5) | 6a. Number of chapters does not exceed 5 6a1. System notifies author to add more chapters 6a2. Author continues filling remaining chapters |  |
| 7 | Author sends publish request to Admin |  |  |
| 8 | Admin reviews and approves the novel – System publishes the novel | 8a. Admin does not approve the novel 8a1. System notifies author with the reason for rejection 8a2. Author edits novel and re-submits publish request |  |

4.2.2. UC: Publish new chapter

a. Activity diagram

![image](./images/memberB/image5.png)

b. Use case description

| Objective | This function allows authors to publish a new chapter for an existing novel on the platform |
| Actor | Author, System, AI System, Admin |
| Trigger | Author wants to add and publish a new chapter to their novel |
| Pre-condition | Author has an account in the system, logged in successfully, and has at least one novel created in the system |
| Post-condition | - The new chapter is published on the platform - System records the successful chapter publication activity to database |

| Step | Basic Flow | Exception Flow | Alternative Flow |
| 1 | Author clicks "Truyện của tôi" – System displays author's my story interface |  |  |
| 2 | Author clicks on one novel – System displays the novel information |  |  |
| 3 | Author clicks on "Add new chapter" – System displays the interface to write content |  |  |
| 4 | Author fills chapter's data (title, content) |  |  |
| 5 | Author clicks "Lưu tạm" – System checks validation of the data (Content > 500 characters AND Title < 100 characters) | 5a. System detects validation errors 5a1. System displays message requiring user to fill correctly 5a2. Author re-fills chapter's data |  |
| 6 | System passes chapter to AI System to check for content violations | 6a. AI System detects violation of the information 6a1. System displays message requiring user to correct the content 6a2. Author edits and re-submits chapter's data |  |
| 7 | Author sends publish request to Admin |  |  |
| 8 | Admin reviews and approves the chapter – System publishes the chapter | 8a. Admin does not approve the chapter 8a1. System notifies author with the reason why the chapter is not approved 8a2. Author edits the chapter and re-sends the publish request |  |

5. Design UI/UX

5.2. Mockups Web UI (Author)

Author “Truyện của tôi” page:

![image](./images/memberB/image6.png)

Filling novel information page:

![image](./images/memberB/image7.png)

Add new chapter page:

![image](./images/memberB/image8.png)

Check information and send request page:

![image](./images/memberB/image9.png)

