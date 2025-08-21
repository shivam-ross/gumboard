import { test, expect } from "../fixtures/test-helpers";
import { addDays } from "date-fns";

test.describe("Note Management", () => {
  test("should create a note and add checklist items", async ({
    authenticatedPage,
    testContext,
    testPrisma,
  }) => {
    const boardName = testContext.getBoardName("Test Board");
    const board = await testPrisma.board.create({
      data: {
        name: boardName,
        description: testContext.prefix("Test board description"),
        createdBy: testContext.userId,
        organizationId: testContext.organizationId,
      },
    });

    await authenticatedPage.goto(`/boards/${board.id}`);

    const createNoteResponse = authenticatedPage.waitForResponse(
      (resp) =>
        resp.url().includes(`/api/boards/${board.id}/notes`) &&
        resp.request().method() === "POST" &&
        resp.status() === 201
    );
    await authenticatedPage.click('button:has-text("Add Note")');
    await createNoteResponse;

    // Since the note is empty, it should show the new-item input automatically
    const testItemContent = testContext.prefix("Test checklist item");

    // Look for any textarea in the note (the initial empty item input)
    const initialTextarea = authenticatedPage.locator("textarea").first();
    await expect(initialTextarea).toBeVisible({ timeout: 10000 });

    await initialTextarea.fill(testItemContent);

    // Use Tab key to move focus away and trigger blur
    await initialTextarea.press("Tab");

    // Wait for the content to appear in the UI (this means at least one submission worked)
    await expect(authenticatedPage.getByText(testItemContent)).toBeVisible();

    // Add a small delay to ensure all async operations complete
    await authenticatedPage.waitForTimeout(1000);

    const notes = await testPrisma.note.findMany({
      where: {
        boardId: board.id,
      },
      include: {
        checklistItems: true,
      },
    });

    expect(notes).toHaveLength(1);
    expect(notes[0].checklistItems).toHaveLength(1);
    expect(notes[0].checklistItems[0].content).toBe(testItemContent);
  });

  test("should edit checklist item content", async ({
    authenticatedPage,
    testContext,
    testPrisma,
  }) => {
    const boardName = testContext.getBoardName("Test Board");
    const board = await testPrisma.board.create({
      data: {
        name: boardName,
        description: testContext.prefix("Test board description"),
        createdBy: testContext.userId,
        organizationId: testContext.organizationId,
      },
    });

    const itemId = testContext.prefix("item-1");
    const originalContent = testContext.prefix("Original item");

    const note = await testPrisma.note.create({
      data: {
        color: "#fef3c7",
        boardId: board.id,
        createdBy: testContext.userId,
      },
    });

    await testPrisma.checklistItem.create({
      data: {
        id: testContext.prefix("item-1"),
        content: originalContent,
        checked: false,
        order: 0,
        noteId: note.id,
      },
    });

    await authenticatedPage.goto(`/boards/${board.id}`);

    const editedContent = testContext.prefix("Edited item");
    await authenticatedPage.getByText(originalContent).click();
    const editInput = authenticatedPage.getByTestId(itemId).getByRole("textbox");
    await expect(editInput).toBeVisible();
    await expect(editInput).toHaveValue(originalContent);
    const saveEditResponse = authenticatedPage.waitForResponse(
      (resp) =>
        resp.url().includes(`/api/boards/${board.id}/notes/`) &&
        resp.request().method() === "PUT" &&
        resp.ok()
    );
    await editInput.fill(editedContent);
    await authenticatedPage.click("body");
    await saveEditResponse;

    await expect(authenticatedPage.getByText(editedContent)).toBeVisible();

    const updatedNote = await testPrisma.note.findUnique({
      where: { id: note.id },
      include: {
        checklistItems: true,
      },
    });

    expect(updatedNote).not.toBeNull();
    expect(updatedNote?.checklistItems).toHaveLength(1);
    expect(updatedNote?.checklistItems[0].content).toBe(editedContent);
  });

  test("should use correct boardId for all API calls", async ({
    authenticatedPage,
    testContext,
    testPrisma,
  }) => {
    const boardName = testContext.getBoardName("Test Board");
    const board = await testPrisma.board.create({
      data: {
        name: boardName,
        description: testContext.prefix("Test board description"),
        createdBy: testContext.userId,
        organizationId: testContext.organizationId,
      },
    });

    const testItemContent = testContext.prefix("Test item");
    await testPrisma.note.create({
      data: {
        color: "#fef3c7",
        boardId: board.id,
        createdBy: testContext.userId,
        checklistItems: {
          create: [
            {
              id: testContext.prefix("item-1"),
              content: testItemContent,
              checked: false,
              order: 0,
            },
          ],
        },
      },
    });

    await authenticatedPage.goto(`/boards/${board.id}`);

    // Test 1: Toggle checklist item
    const checkbox = authenticatedPage.locator('[data-state="unchecked"]').first();
    await expect(checkbox).toBeVisible();
    const toggleResponse = authenticatedPage.waitForResponse(
      (resp) =>
        resp.url().includes(`/api/boards/${board.id}/notes/`) &&
        resp.request().method() === "PUT" &&
        resp.ok()
    );
    await checkbox.click();
    await toggleResponse;

    // Verify toggle in database
    const toggledItem = await testPrisma.checklistItem.findFirst({
      where: { id: testContext.prefix("item-1") },
    });
    expect(toggledItem?.checked).toBe(true);

    // Test 2: Add a new checklist item using always-available input
    const newItemInput = authenticatedPage.getByTestId("new-item").locator("textarea");
    await expect(newItemInput).toBeVisible();
    const newItemContent = testContext.prefix("New test item");
    const addItemResponse = authenticatedPage.waitForResponse(
      (resp) =>
        resp.url().includes(`/api/boards/${board.id}/notes/`) &&
        resp.request().method() === "PUT" &&
        resp.ok(),
      { timeout: 15000 }
    );
    await newItemInput.fill(newItemContent);
    await newItemInput.blur();
    await addItemResponse;

    // Verify new item in database
    const newItem = await testPrisma.checklistItem.findFirst({
      where: { content: newItemContent },
    });
    expect(newItem).toBeTruthy();

    // Test 3: Edit checklist item content
    const existingItem = authenticatedPage.locator(`text=${testItemContent}`).first();
    await expect(existingItem).toBeVisible();
    await existingItem.dblclick();
    const editInput = authenticatedPage
      .getByTestId(testContext.prefix("item-1"))
      .locator("textarea");
    await expect(editInput).toBeVisible();
    const editedContent = testContext.prefix("Edited test item");
    const editResponse = authenticatedPage.waitForResponse(
      (resp) =>
        resp.url().includes(`/api/boards/${board.id}/notes/`) &&
        resp.request().method() === "PUT" &&
        resp.ok()
    );
    await editInput.fill(editedContent);
    await authenticatedPage.locator("body").click();
    await editResponse;

    // Verify edit in database
    const editedItem = await testPrisma.checklistItem.findFirst({
      where: { content: editedContent },
    });
    expect(editedItem).toBeTruthy();

    // Test 4: Delete checklist item
    const deleteResponse = authenticatedPage.waitForResponse(
      (resp) =>
        resp.url().includes(`/api/boards/${board.id}/notes/`) &&
        resp.request().method() === "PUT" &&
        resp.ok()
    );
    await authenticatedPage
      .getByTestId(testContext.prefix("item-1"))
      .getByRole("button", { name: "Delete item" })
      .click();
    await deleteResponse;

    // Verify deletion in database
    const deletedItem = await testPrisma.checklistItem.findFirst({
      where: { id: testContext.prefix("item-1") },
    });
    expect(deletedItem).toBeNull();
  });

  test("should autofocus new checklist item input when Add task is clicked", async ({
    authenticatedPage,
    testContext,
    testPrisma,
  }) => {
    const boardName = testContext.getBoardName("Test Board");
    const board = await testPrisma.board.create({
      data: {
        name: boardName,
        description: testContext.prefix("Test board description"),
        createdBy: testContext.userId,
        organizationId: testContext.organizationId,
      },
    });

    await authenticatedPage.goto(`/boards/${board.id}`);

    const createNoteResponse = authenticatedPage.waitForResponse(
      (resp) =>
        resp.url().includes(`/api/boards/${board.id}/notes`) &&
        resp.request().method() === "POST" &&
        resp.status() === 201
    );
    await authenticatedPage.click('button:has-text("Add Note")');
    await createNoteResponse;

    const initialInput = authenticatedPage.locator("textarea.bg-transparent").first();
    const firstItemContent = testContext.prefix("First item");
    const addFirstItemResponse = authenticatedPage.waitForResponse(
      (resp) =>
        resp.url().includes(`/api/boards/${board.id}/notes/`) &&
        resp.request().method() === "PUT" &&
        resp.ok()
    );
    await initialInput.fill(firstItemContent);
    await initialInput.blur();
    await addFirstItemResponse;

    const newItemInput = authenticatedPage.getByTestId("new-item").locator("textarea");
    await expect(newItemInput).toBeVisible();

    await newItemInput.click();
    await expect(newItemInput).toBeFocused();

    await newItemInput.blur();

    await newItemInput.click();
    await expect(newItemInput).toBeFocused();
  });

  test("should create a checklist note and verify database state", async ({
    authenticatedPage,
    testContext,
    testPrisma,
  }) => {
    const boardName = testContext.getBoardName("Test Board");
    const board = await testPrisma.board.create({
      data: {
        name: boardName,
        description: testContext.prefix("Test board description"),
        createdBy: testContext.userId,
        organizationId: testContext.organizationId,
      },
    });

    await authenticatedPage.goto(`/boards/${board.id}`);

    const createNoteResponse = authenticatedPage.waitForResponse(
      (resp) =>
        resp.url().includes(`/api/boards/${board.id}/notes`) &&
        resp.request().method() === "POST" &&
        resp.status() === 201
    );
    await authenticatedPage.click('button:has-text("Add Note")');
    await createNoteResponse;

    // Verify note was created in database
    const createdNote = await testPrisma.note.findFirst({
      where: {
        boardId: board.id,
        createdBy: testContext.userId,
      },
      include: {
        checklistItems: true,
      },
    });

    expect(createdNote).toBeTruthy();
    expect(createdNote?.boardId).toBe(board.id);
    expect(createdNote?.color).toMatch(/^#[0-9a-f]{6}$/i); // Valid hex color
    expect(createdNote?.checklistItems).toHaveLength(0); // Notes start empty
  });

  test("should toggle checklist item completion", async ({
    authenticatedPage,
    testContext,
    testPrisma,
  }) => {
    const boardName = testContext.getBoardName("Test Board");
    const board = await testPrisma.board.create({
      data: {
        name: boardName,
        description: testContext.prefix("Test board description"),
        createdBy: testContext.userId,
        organizationId: testContext.organizationId,
      },
    });

    const toggleItemId = testContext.prefix("toggle-item-1");
    const testItemContent = testContext.prefix("Test item");

    const note = await testPrisma.note.create({
      data: {
        color: "#fef3c7",
        boardId: board.id,
        createdBy: testContext.userId,
      },
    });

    await testPrisma.checklistItem.create({
      data: {
        id: toggleItemId,
        content: testItemContent,
        checked: false,
        order: 0,
        noteId: note.id,
      },
    });

    await authenticatedPage.goto(`/boards/${board.id}`);

    const checkbox = authenticatedPage.locator('[data-state="unchecked"]').first();
    await expect(checkbox).toBeVisible();
    const toggleResponse = authenticatedPage.waitForResponse(
      (resp) =>
        resp.url().includes(`/api/boards/${board.id}/notes/`) &&
        resp.request().method() === "PUT" &&
        resp.ok()
    );
    await checkbox.click();
    await toggleResponse;

    const updatedNote = await testPrisma.note.findUnique({
      where: { id: note.id },
      include: {
        checklistItems: true,
      },
    });

    expect(updatedNote).not.toBeNull();
    expect(updatedNote?.checklistItems).toHaveLength(1);
    expect(updatedNote?.checklistItems[0]?.checked).toBe(true);
  });

  test("should delete checklist item", async ({ authenticatedPage, testContext, testPrisma }) => {
    const boardName = testContext.getBoardName("Test Board");
    const board = await testPrisma.board.create({
      data: {
        name: boardName,
        description: testContext.prefix("Test board description"),
        createdBy: testContext.userId,
        organizationId: testContext.organizationId,
      },
    });

    const deleteItemId = testContext.prefix("delete-item-1");
    const itemToDeleteContent = testContext.prefix("Item to delete");

    const note = await testPrisma.note.create({
      data: {
        color: "#fef3c7",
        boardId: board.id,
        createdBy: testContext.userId,
      },
    });

    await testPrisma.checklistItem.create({
      data: {
        id: deleteItemId,
        content: itemToDeleteContent,
        checked: false,
        order: 0,
        noteId: note.id,
      },
    });

    await authenticatedPage.goto(`/boards/${board.id}`);

    const deleteItemResponse = authenticatedPage.waitForResponse(
      (resp) =>
        resp.url().includes(`/api/boards/${board.id}/notes/`) &&
        resp.request().method() === "PUT" &&
        resp.ok()
    );
    await authenticatedPage.getByRole("button", { name: "Delete item", exact: true }).click();
    await deleteItemResponse;

    await expect(authenticatedPage.getByText(itemToDeleteContent)).not.toBeVisible();

    const updatedNote = await testPrisma.note.findUnique({
      where: { id: note.id },
      include: {
        checklistItems: true,
      },
    });

    expect(updatedNote).not.toBeNull();
    expect(updatedNote?.checklistItems).toHaveLength(0);
  });

  test.describe("Drag and Drop", () => {
    test("should reorder checklist items within a note", async ({
      authenticatedPage,
      testContext,
      testPrisma,
    }) => {
      const boardName = testContext.getBoardName("Test Board");
      const board = await testPrisma.board.create({
        data: {
          name: boardName,
          description: testContext.prefix("Test board description"),
          createdBy: testContext.userId,
          organizationId: testContext.organizationId,
        },
      });

      const itemA1Id = testContext.prefix("item-a1");
      const itemA2Id = testContext.prefix("item-a2");
      const itemA3Id = testContext.prefix("item-a3");

      const note = await testPrisma.note.create({
        data: {
          color: "#fef3c7",
          boardId: board.id,
          createdBy: testContext.userId,
        },
      });

      await testPrisma.checklistItem.createMany({
        data: [
          {
            id: itemA1Id,
            content: testContext.prefix("Item A1"),
            checked: false,
            order: 0,
            noteId: note.id,
          },
          {
            id: itemA2Id,
            content: testContext.prefix("Item A2"),
            checked: false,
            order: 1,
            noteId: note.id,
          },
          {
            id: itemA3Id,
            content: testContext.prefix("Item A3"),
            checked: false,
            order: 2,
            noteId: note.id,
          },
        ],
      });

      await authenticatedPage.goto(`/boards/${board.id}`);

      const sourceElement = authenticatedPage.getByTestId(itemA3Id);
      const targetElement = authenticatedPage.getByTestId(itemA1Id);

      await expect(sourceElement).toBeVisible();
      await expect(targetElement).toBeVisible();

      const targetBox = await targetElement.boundingBox();
      if (!targetBox) throw new Error("Target element not found");

      const reorderResponse = authenticatedPage.waitForResponse(
        (resp) =>
          resp.url().includes(`/api/boards/${board.id}/notes/`) &&
          resp.request().method() === "PUT" &&
          resp.ok()
      );
      await sourceElement.hover();
      await authenticatedPage.mouse.down();
      await targetElement.hover();
      await targetElement.hover();
      await authenticatedPage.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + 5);
      await authenticatedPage.mouse.up();
      await reorderResponse;

      const updatedNote = await testPrisma.note.findUnique({
        where: { id: note.id },
        include: {
          checklistItems: {
            orderBy: { order: "asc" },
          },
        },
      });

      expect(updatedNote).not.toBeNull();
      const checklistItems = updatedNote?.checklistItems || [];
      expect(checklistItems[0].content).toBe(testContext.prefix("Item A3"));
      expect(checklistItems[1].content).toBe(testContext.prefix("Item A1"));
      expect(checklistItems[2].content).toBe(testContext.prefix("Item A2"));
    });

    test("should not allow drag and drop between different notes", async ({
      authenticatedPage,
      testContext,
      testPrisma,
    }) => {
      const boardName = testContext.getBoardName("Test Board");
      const board = await testPrisma.board.create({
        data: {
          name: boardName,
          description: testContext.prefix("Test board description"),
          createdBy: testContext.userId,
          organizationId: testContext.organizationId,
        },
      });

      const note1ItemId = testContext.prefix("note1-item");
      const note2ItemId = testContext.prefix("note2-item");

      const note1 = await testPrisma.note.create({
        data: {
          color: "#fef3c7",
          boardId: board.id,
          createdBy: testContext.userId,
        },
      });

      await testPrisma.checklistItem.create({
        data: {
          id: note1ItemId,
          content: testContext.prefix("Note1 Item"),
          checked: false,
          order: 0,
          noteId: note1.id,
        },
      });

      const note2 = await testPrisma.note.create({
        data: {
          color: "#fef3c7",
          boardId: board.id,
          createdBy: testContext.userId,
        },
      });

      await testPrisma.checklistItem.create({
        data: {
          id: note2ItemId,
          content: testContext.prefix("Note2 Item"),
          checked: false,
          order: 0,
          noteId: note2.id,
        },
      });

      await authenticatedPage.goto(`/boards/${board.id}`);

      const sourceElement = authenticatedPage.getByTestId(note1ItemId);
      const targetElement = authenticatedPage.getByTestId(note2ItemId);

      await expect(sourceElement).toBeVisible();
      await expect(targetElement).toBeVisible();

      const targetBox = await targetElement.boundingBox();
      if (!targetBox) throw new Error("Target element not found");

      await sourceElement.hover();
      await authenticatedPage.mouse.down();
      await targetElement.hover();
      await targetElement.hover();
      await authenticatedPage.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + 5);
      await authenticatedPage.mouse.up();

      const updatedNote1 = await testPrisma.note.findUnique({
        where: { id: note1.id },
        include: {
          checklistItems: true,
        },
      });

      const updatedNote2 = await testPrisma.note.findUnique({
        where: { id: note2.id },
        include: {
          checklistItems: true,
        },
      });

      expect(updatedNote1?.checklistItems).toHaveLength(1);
      expect(updatedNote1?.checklistItems[0].content).toBe(testContext.prefix("Note1 Item"));
      expect(updatedNote2?.checklistItems).toHaveLength(1);
      expect(updatedNote2?.checklistItems[0].content).toBe(testContext.prefix("Note2 Item"));
    });

    test("should display empty state when no notes exist", async ({
      authenticatedPage,
      testContext,
      testPrisma,
    }) => {
      const boardName = testContext.getBoardName("Empty Test Board");
      const board = await testPrisma.board.create({
        data: {
          name: boardName,
          description: testContext.prefix("Empty test board"),
          createdBy: testContext.userId,
          organizationId: testContext.organizationId,
        },
      });

      // Ensure no notes exist
      const noteCount = await testPrisma.note.count({
        where: {
          boardId: board.id,
          archivedAt: null,
        },
      });
      expect(noteCount).toBe(0);

      await authenticatedPage.goto(`/boards/${board.id}`);

      await expect(authenticatedPage.locator('button:has-text("Add Note")')).toBeVisible();
    });

    test("should create a note in the all notes view", async ({
      authenticatedPage,
      testContext,
      testPrisma,
    }) => {
      // Create a board for testing all notes view
      const boardName = testContext.getBoardName("All Notes Test Board");
      await testPrisma.board.create({
        data: {
          name: boardName,
          description: testContext.prefix("All notes test board"),
          createdBy: testContext.userId,
          organizationId: testContext.organizationId,
        },
      });

      await authenticatedPage.goto("/boards/all-notes");

      const createNoteResponse = authenticatedPage.waitForResponse(
        (resp) =>
          resp.url().includes(`/api/boards/`) &&
          resp.url().includes(`/notes`) &&
          resp.request().method() === "POST" &&
          resp.status() === 201
      );
      await authenticatedPage.getByRole("button", { name: "Add Note" }).first().click();
      await createNoteResponse;

      await expect(authenticatedPage.locator(".shadow-md")).toBeVisible();

      // Verify note was created in database (could be on any board)
      const createdNote = await testPrisma.note.findFirst({
        where: {
          createdBy: testContext.userId,
          deletedAt: null,
        },
        orderBy: {
          createdAt: "desc",
        },
      });
      expect(createdNote).toBeTruthy();
    });
  });

  test.describe("Delete with Undo (toasts)", () => {
    test("should show Undo toast and restore note without issuing DELETE when undone", async ({
      authenticatedPage,
      testContext,
      testPrisma,
    }) => {
      const boardName = testContext.getBoardName("Test Board");
      const board = await testPrisma.board.create({
        data: {
          name: boardName,
          description: testContext.prefix("Test board description"),
          createdBy: testContext.userId,
          organizationId: testContext.organizationId,
        },
      });

      const note = await testPrisma.note.create({
        data: {
          color: "#fef3c7",
          boardId: board.id,
          createdBy: testContext.userId,
        },
      });

      let deleteCalled = false;

      await authenticatedPage.route(`**/api/boards/${board.id}/notes/${note.id}`, async (route) => {
        if (route.request().method() === "DELETE") {
          deleteCalled = true;
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({}),
          });
        } else {
          await route.continue();
        }
      });

      await authenticatedPage.goto(`/boards/${board.id}`);
      await authenticatedPage
        .getByRole("button", { name: `Delete Note ${note.id}`, exact: true })
        .click();
      await expect(authenticatedPage.getByText("Note deleted")).toBeVisible();
      await authenticatedPage.getByRole("button", { name: "Undo" }).click();

      await expect(
        authenticatedPage.getByRole("button", { name: `Delete Note ${note.id}`, exact: true })
      ).toBeVisible();

      // Wait a moment to ensure no delete call is made
      await authenticatedPage
        .waitForResponse(
          (resp) =>
            resp.url().includes(`/api/boards/${board.id}/notes/${note.id}`) &&
            resp.request().method() === "DELETE",
          { timeout: 500 }
        )
        .catch(() => {
          // Expected to timeout - no delete should happen
        });
      expect(deleteCalled).toBe(false);
    });
  });

  test.describe("Empty Note Prevention", () => {
    test("should create empty item when pressing Enter at start of item", async ({
      authenticatedPage,
      testContext,
      testPrisma,
    }) => {
      const boardName = testContext.getBoardName("Test Board");
      const board = await testPrisma.board.create({
        data: {
          name: boardName,
          description: testContext.prefix("Test board description"),
          createdBy: testContext.userId,
          organizationId: testContext.organizationId,
        },
      });

      await authenticatedPage.goto(`/boards/${board.id}`);

      const createNoteResponse = authenticatedPage.waitForResponse(
        (resp) =>
          resp.url().includes(`/api/boards/${board.id}/notes`) &&
          resp.request().method() === "POST" &&
          resp.status() === 201
      );
      await authenticatedPage.click('button:has-text("Add Note")');
      await createNoteResponse;

      // When a note is created empty, it automatically shows the new item input
      const testItemContent = testContext.prefix("First item content");

      // Look for any textarea in the newly created note
      const newItemInput = authenticatedPage.locator("textarea").first();
      await expect(newItemInput).toBeVisible({ timeout: 10000 });

      const addItemResponse = authenticatedPage.waitForResponse(
        (resp) =>
          resp.url().includes(`/api/boards/${board.id}/notes/`) &&
          resp.request().method() === "PUT" &&
          resp.ok(),
        { timeout: 15000 }
      );
      await newItemInput.fill(testItemContent);
      await newItemInput.blur();
      await addItemResponse;

      await expect(authenticatedPage.getByText(testItemContent)).toBeVisible();

      await authenticatedPage.getByText(testItemContent).click();

      const itemInput = authenticatedPage.locator(`textarea`).filter({ hasText: testItemContent });
      await expect(itemInput).toBeVisible();

      await itemInput.focus();
      await authenticatedPage.keyboard.press("Home");

      await itemInput.press("Enter");

      // Wait for any potential network activity to complete
      await authenticatedPage.waitForLoadState("networkidle");

      const checklistItems = authenticatedPage
        .getByRole("checkbox")
        .filter({ hasNot: authenticatedPage.getByTestId("new-item") });
      await expect(checklistItems).toHaveCount(2);
      await expect(authenticatedPage.getByText(testItemContent)).toBeVisible();
    });

    test("should create empty item when pressing Enter at end of item", async ({
      authenticatedPage,
      testContext,
      testPrisma,
    }) => {
      const boardName = testContext.getBoardName("Test Board");
      const board = await testPrisma.board.create({
        data: {
          name: boardName,
          description: testContext.prefix("Test board description"),
          createdBy: testContext.userId,
          organizationId: testContext.organizationId,
        },
      });

      await authenticatedPage.goto(`/boards/${board.id}`);

      const createNoteResponse = authenticatedPage.waitForResponse(
        (resp) =>
          resp.url().includes(`/api/boards/${board.id}/notes`) &&
          resp.request().method() === "POST" &&
          resp.status() === 201
      );
      await authenticatedPage.click('button:has-text("Add Note")');
      await createNoteResponse;

      // When a note is created empty, it automatically shows the new item input
      const testItemContent = testContext.prefix("Last item content");

      // Look for any textarea in the newly created note
      const newItemInput = authenticatedPage.locator("textarea").first();
      await expect(newItemInput).toBeVisible({ timeout: 10000 });

      const addItemResponse = authenticatedPage.waitForResponse(
        (resp) =>
          resp.url().includes(`/api/boards/${board.id}/notes/`) &&
          resp.request().method() === "PUT" &&
          resp.ok(),
        { timeout: 15000 }
      );
      await newItemInput.fill(testItemContent);
      await newItemInput.blur();
      await addItemResponse;

      await expect(authenticatedPage.getByText(testItemContent)).toBeVisible();

      await authenticatedPage.getByText(testItemContent).click();

      const itemInput = authenticatedPage.locator(`textarea`).filter({ hasText: testItemContent });
      await expect(itemInput).toBeVisible();

      await itemInput.focus();
      await authenticatedPage.keyboard.press("End");

      await itemInput.press("Enter");

      // Wait for any potential network activity to complete
      await authenticatedPage.waitForLoadState("networkidle");

      const checklistItems = authenticatedPage
        .getByRole("checkbox")
        .filter({ hasNot: authenticatedPage.getByTestId("new-item") });
      await expect(checklistItems).toHaveCount(2);
      await expect(authenticatedPage.getByText(testItemContent)).toBeVisible();
    });
  });

  test.describe("Note Filters", () => {
    test("should create and filter notes between a given date", async ({
      authenticatedPage,
      testContext,
      testPrisma,
    }) => {
      const boardName = testContext.getBoardName("Test Board");
      const board = await testPrisma.board.create({
        data: {
          name: boardName,
          description: testContext.prefix("Test board description"),
          createdBy: testContext.userId,
          organizationId: testContext.organizationId,
        },
      });

      // Create notes for today
      for (let i = 0; i < 3; i++) {
        await testPrisma.note.create({
          data: {
            color: "#fef3c7",
            boardId: board.id,
            createdBy: testContext.userId,
            createdAt: new Date(),
          },
        });
      }

      // Create notes for 5 days ago
      for (let i = 0; i < 2; i++) {
        await testPrisma.note.create({
          data: {
            color: "#fef3c7",
            boardId: board.id,
            createdBy: testContext.userId,
            createdAt: addDays(new Date(), -5),
          },
        });
      }

      const today = new Date();
      const yesterday = addDays(today, -1);

      await authenticatedPage.goto(`/boards/${board.id}`);
      await authenticatedPage.locator('[data-slot="filter-popover"]').click();
      await authenticatedPage.getByRole("button", { name: "Select date range" }).click();

      // Start date
      await authenticatedPage
        .getByRole("button", { name: "Pick a start date", exact: true })
        .click();
      const startCalendar = authenticatedPage.locator('table[role="grid"]');
      await expect(startCalendar).toBeVisible();

      const startDateStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`;
      const startDateCell = startCalendar.locator(
        `td[role="gridcell"][data-day="${startDateStr}"]:not([data-disabled="true"])`
      );
      await startDateCell.waitFor({ state: "visible" });
      await startDateCell.click();

      // End date
      await authenticatedPage.getByRole("button", { name: "Pick an end date" }).click();
      const endCalendar = authenticatedPage.locator('table[role="grid"]');
      await expect(endCalendar).toBeVisible();

      const endDateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
      const endDateCell = endCalendar.locator(
        `td[role="gridcell"][data-day="${endDateStr}"]:not([data-disabled="true"])`
      );
      await endDateCell.waitFor({ state: "visible" });
      await endDateCell.click();

      await authenticatedPage.getByRole("button", { name: "Apply" }).click();
      await expect(authenticatedPage.locator('[data-testid="note-card"]')).toHaveCount(3);
    });

    test("should filter notes by author", async ({
      authenticatedPage,
      testContext,
      testPrisma,
    }) => {
      // Create a second author
      const otherUserId = `usr_other_${testContext.testId}`;
      await testPrisma.user.create({
        data: {
          id: otherUserId,
          email: `other-${testContext.testId}@example.com`,
          name: "Other User",
          organizationId: testContext.organizationId,
        },
      });

      const boardName = testContext.getBoardName("Test Board Author");
      const board = await testPrisma.board.create({
        data: {
          name: boardName,
          description: testContext.prefix("Test board description"),
          createdBy: testContext.userId,
          organizationId: testContext.organizationId,
        },
      });

      // Create 3 notes by the current user
      for (let index = 0; index < 3; index++) {
        await testPrisma.note.create({
          data: {
            color: "#fef3c7",
            boardId: board.id,
            createdBy: testContext.userId,
          },
        });
      }

      // Create 2 notes by the other user
      for (let index = 0; index < 2; index++) {
        await testPrisma.note.create({
          data: {
            color: "#fef3c7",
            boardId: board.id,
            createdBy: otherUserId,
          },
        });
      }

      await authenticatedPage.goto(`/boards/${board.id}`);
      await expect(authenticatedPage.locator('[data-testid="note-card"]')).toHaveCount(5);
      await authenticatedPage.locator('[data-slot="filter-popover"]').click();
      await authenticatedPage.getByRole("button", { name: testContext.userEmail }).click();
      await expect(authenticatedPage.locator('[data-testid="note-card"]')).toHaveCount(3);
      await expect(authenticatedPage.getByText("1", { exact: true })).toBeVisible();
      await authenticatedPage.locator('[data-slot="filter-popover"]').click();
      await authenticatedPage.locator('[data-slot="all-authors-button"]').click({ force: true });
      await expect(authenticatedPage.locator('[data-testid="note-card"]')).toHaveCount(5);
      await expect(authenticatedPage.getByText("1", { exact: true })).not.toBeVisible();
    });
  });

  test("should copy a note with all its checklist items", async ({
    authenticatedPage,
    testContext,
    testPrisma,
  }) => {
    const boardName = testContext.getBoardName("Copy Test Board");
    const board = await testPrisma.board.create({
      data: {
        name: boardName,
        description: testContext.prefix("Test board for copying notes"),
        createdBy: testContext.userId,
        organizationId: testContext.organizationId,
      },
    });

    const originalNote = await testPrisma.note.create({
      data: {
        color: "#f3e8ff",
        boardId: board.id,
        createdBy: testContext.userId,
        checklistItems: {
          create: [
            {
              id: testContext.prefix("original-item-1"),
              content: testContext.prefix("First checklist item"),
              checked: false,
              order: 0,
            },
            {
              id: testContext.prefix("original-item-2"),
              content: testContext.prefix("Second checklist item"),
              checked: true,
              order: 1,
            },
            {
              id: testContext.prefix("original-item-3"),
              content: testContext.prefix("Third checklist item"),
              checked: false,
              order: 2,
            },
          ],
        },
      },
      include: {
        checklistItems: true,
      },
    });

    await authenticatedPage.goto(`/boards/${board.id}`);

    await expect(authenticatedPage.locator('[data-testid="note-card"]')).toHaveCount(1, {
      timeout: 10000,
    });
    await expect(
      authenticatedPage.getByText(testContext.prefix("First checklist item"))
    ).toBeVisible();

    const noteCard = authenticatedPage.locator('[data-testid="note-card"]').first();

    await noteCard.hover();

    const copyButton = noteCard.getByRole("button", { name: /Copy Note/i });
    await expect(copyButton).toBeVisible({ timeout: 5000 });

    const copyNoteResponse = authenticatedPage.waitForResponse(
      (resp) =>
        resp.url().includes(`/api/boards/${board.id}/notes`) &&
        resp.request().method() === "POST" &&
        resp.status() === 201
    );

    await copyButton.click();
    await copyNoteResponse;

    await expect(authenticatedPage.locator('[data-testid="note-card"]')).toHaveCount(2, {
      timeout: 10000,
    });

    await expect(
      authenticatedPage.getByText(testContext.prefix("First checklist item"))
    ).toHaveCount(2);
    await expect(
      authenticatedPage.getByText(testContext.prefix("Second checklist item"))
    ).toHaveCount(2);
    await expect(
      authenticatedPage.getByText(testContext.prefix("Third checklist item"))
    ).toHaveCount(2);

    const allNotes = await testPrisma.note.findMany({
      where: {
        boardId: board.id,
        deletedAt: null,
      },
      include: {
        checklistItems: {
          orderBy: { order: "asc" },
        },
      },
    });

    expect(allNotes).toHaveLength(2);

    const originalNoteFromDb = allNotes.find((note) => note.id === originalNote.id);
    const copiedNote = allNotes.find((note) => note.id !== originalNote.id);

    expect(originalNoteFromDb).toBeDefined();
    expect(copiedNote).toBeDefined();

    expect(copiedNote!.color).toBe(originalNoteFromDb!.color);

    expect(copiedNote!.checklistItems).toHaveLength(3);
    expect(originalNoteFromDb!.checklistItems).toHaveLength(3);

    const originalItems = originalNoteFromDb!.checklistItems;
    const copiedItems = copiedNote!.checklistItems;

    for (let i = 0; i < originalItems.length; i++) {
      expect(copiedItems[i].content).toBe(originalItems[i].content);
      expect(copiedItems[i].checked).toBe(originalItems[i].checked);
      expect(copiedItems[i].order).toBe(originalItems[i].order);
      expect(copiedItems[i].id).not.toBe(originalItems[i].id);
    }

    expect(copiedNote!.createdBy).toBe(testContext.userId);
    expect(copiedNote!.boardId).toBe(board.id);
  });

  test("should copy a note in all-notes view", async ({
    authenticatedPage,
    testContext,
    testPrisma,
  }) => {
    const boardName = testContext.getBoardName("All Notes Copy Test");
    const board = await testPrisma.board.create({
      data: {
        name: boardName,
        description: testContext.prefix("Test board for all-notes copy"),
        createdBy: testContext.userId,
        organizationId: testContext.organizationId,
      },
    });

     await testPrisma.note.create({
      data: {
        color: "#dbeafe",
        boardId: board.id,
        createdBy: testContext.userId,
        checklistItems: {
          create: [
            {
              id: testContext.prefix("all-notes-item"),
              content: testContext.prefix("All notes copy test item"),
              checked: false,
              order: 0,
            },
          ],
        },
      },
    });

    await authenticatedPage.goto(`/boards/all-notes`);

    await expect(authenticatedPage.locator('[data-testid="note-card"]')).toHaveCount(1, {
      timeout: 10000,
    });
    await expect(
      authenticatedPage.getByText(testContext.prefix("All notes copy test item"))
    ).toBeVisible();

    const noteCard = authenticatedPage.locator('[data-testid="note-card"]').first();
    await noteCard.hover();

    const copyButton = noteCard.getByRole("button", { name: /Copy Note/i });
    await expect(copyButton).toBeVisible({ timeout: 5000 });

    const copyNoteResponse = authenticatedPage.waitForResponse(
      (resp) =>
        resp.url().includes(`/api/boards/all-notes/notes`) &&
        resp.request().method() === "POST" &&
        resp.status() === 201
    );

    await copyButton.click();
    await copyNoteResponse;

    await expect(authenticatedPage.locator('[data-testid="note-card"]')).toHaveCount(2, {
      timeout: 10000,
    });

    await expect(
      authenticatedPage.getByText(testContext.prefix("All notes copy test item"))
    ).toHaveCount(2);

    // Verify in database
    const allNotes = await testPrisma.note.findMany({
      where: {
        boardId: board.id,
        deletedAt: null,
      },
    });

    expect(allNotes).toHaveLength(2);
  });

  test("should not show copy button for readonly notes", async ({
    authenticatedPage,
    testContext,
    testPrisma,
  }) => {
    const otherUser = await testPrisma.user.create({
      data: {
        id: testContext.prefix("other-user"),
        email: testContext.prefix("other@example.com"),
        name: testContext.prefix("Other User"),
        organizationId: testContext.organizationId,
      },
    });

    const boardName = testContext.getBoardName("Readonly Copy Test");
    const board = await testPrisma.board.create({
      data: {
        name: boardName,
        description: testContext.prefix("Test board for readonly copy"),
        createdBy: testContext.userId,
        organizationId: testContext.organizationId,
      },
    });

    await testPrisma.note.create({
      data: {
        color: "#fef3c7",
        boardId: board.id,
        createdBy: otherUser.id,
        checklistItems: {
          create: [
            {
              id: testContext.prefix("readonly-item"),
              content: testContext.prefix("Readonly note item"),
              checked: false,
              order: 0,
            },
          ],
        },
      },
    });

    await authenticatedPage.goto(`/boards/${board.id}`);

    await expect(authenticatedPage.locator('[data-testid="note-card"]')).toHaveCount(1, {
      timeout: 10000,
    });

    const noteCard = authenticatedPage.locator('[data-testid="note-card"]').first();
    await noteCard.hover();

    const copyButton = noteCard.getByRole("button", { name: /Copy Note/i });
    await expect(copyButton).not.toBeVisible();

    const deleteButton = noteCard.getByRole("button", { name: /Delete Note/i });
    await expect(deleteButton).not.toBeVisible();
  });

  test("should hide copy button on archived notes", async ({
    authenticatedPage,
    testContext,
    testPrisma,
  }) => {
    const boardName = testContext.getBoardName("Note Actions Test Board");
    const board = await testPrisma.board.create({
      data: {
        name: boardName,
        description: testContext.prefix("Test board for note actions"),
        createdBy: testContext.userId,
        organizationId: testContext.organizationId,
      },
    });

    await testPrisma.note.create({
      data: {
        color: "#fef3c7",
        boardId: board.id,
        createdBy: testContext.userId,
        archivedAt: new Date(),
        checklistItems: {
          create: [
            {
              content: testContext.prefix("Archived note content"),
              checked: false,
              order: 0,
            },
          ],
        },
      },
    });

    await testPrisma.note.create({
      data: {
        color: "#fef3c7",
        boardId: board.id,
        createdBy: testContext.userId,
        checklistItems: {
          create: [
            {
              content: testContext.prefix("Active note content"),
              checked: false,
              order: 0,
            },
          ],
        },
      },
    });

    await authenticatedPage.goto(`/boards/${board.id}`);
    await expect(authenticatedPage.getByText("Active note content")).toBeVisible();

    await expect(authenticatedPage.getByText("Archived note content")).not.toBeVisible();

    const activeNote = authenticatedPage
      .locator('[data-testid="note-card"]')
      .filter({ hasText: "Active note content" })
      .first();
    await activeNote.hover();
    await expect(activeNote.getByRole("button", { name: "Copy note" })).toBeVisible();

    await authenticatedPage.goto("/boards/archive");

    const archivedNote = authenticatedPage
      .locator('[data-testid="note-card"]')
      .filter({ hasText: "Archived note content" })
      .first();
    await expect(archivedNote).toBeVisible();

    await archivedNote.hover();
    await expect(archivedNote.getByRole("button", { name: "Copy note" })).not.toBeVisible();
  });


  // Tests for Issue #636 functionality
  test.describe("Issue #636: Homepage to-do functionality", () => {
    test("should auto-focus new to-do when note is created", async ({
      authenticatedPage,
      testContext,
      testPrisma,
    }) => {
      const boardName = testContext.getBoardName("Auto Focus Test Board");
      const board = await testPrisma.board.create({
        data: {
          name: boardName,
          description: testContext.prefix("Test board for auto-focus"),
          createdBy: testContext.userId,
          organizationId: testContext.organizationId,
        },
      });

      await authenticatedPage.goto(`/boards/${board.id}`);

      // Create a new note
      const createNoteResponse = authenticatedPage.waitForResponse(
        (resp) =>
          resp.url().includes(`/api/boards/${board.id}/notes`) &&
          resp.request().method() === "POST" &&
          resp.status() === 201
      );
      await authenticatedPage.click('button:has-text("Add note")');
      await createNoteResponse;

      // The new item input should be auto-focused
      const newItemInput = authenticatedPage.getByTestId("new-item").locator("textarea");
      await expect(newItemInput).toBeVisible({ timeout: 5000 });
      await expect(newItemInput).toBeFocused({ timeout: 2000 });
    });

    test("should auto-add empty to-do underneath when typing", async ({
      authenticatedPage,
      testContext,
      testPrisma,
    }) => {
      const boardName = testContext.getBoardName("Auto Add Test Board");
      const board = await testPrisma.board.create({
        data: {
          name: boardName,
          description: testContext.prefix("Test board for auto-add"),
          createdBy: testContext.userId,
          organizationId: testContext.organizationId,
        },
      });

      await authenticatedPage.goto(`/boards/${board.id}`);

      // Create a new note
      const createNoteResponse = authenticatedPage.waitForResponse(
        (resp) =>
          resp.url().includes(`/api/boards/${board.id}/notes`) &&
          resp.request().method() === "POST" &&
          resp.status() === 201
      );
      await authenticatedPage.click('button:has-text("Add note")');
      await createNoteResponse;

      const newItemInput = authenticatedPage.getByTestId("new-item").locator("textarea");
      await expect(newItemInput).toBeVisible({ timeout: 5000 });

      // Initially, additional input should not be visible
      const additionalNewItem = authenticatedPage.getByTestId("new-item-additional");
      await expect(additionalNewItem).not.toBeVisible();

      // Type content and verify additional input appears
      const testContent = testContext.prefix("First item");
      await newItemInput.fill(testContent);
      
      await expect(additionalNewItem).toBeVisible({ timeout: 2000 });

      // Clear content and verify additional input disappears
      await newItemInput.fill("");
      await expect(additionalNewItem).not.toBeVisible({ timeout: 2000 });
    });

    test("should allow tabbing between new item inputs", async ({
      authenticatedPage,
      testContext,
      testPrisma,
    }) => {
      const boardName = testContext.getBoardName("Tab Navigation Test Board");
      const board = await testPrisma.board.create({
        data: {
          name: boardName,
          description: testContext.prefix("Test board for tab navigation"),
          createdBy: testContext.userId,
          organizationId: testContext.organizationId,
        },
      });

      await authenticatedPage.goto(`/boards/${board.id}`);

      // Create a new note
      const createNoteResponse = authenticatedPage.waitForResponse(
        (resp) =>
          resp.url().includes(`/api/boards/${board.id}/notes`) &&
          resp.request().method() === "POST" &&
          resp.status() === 201
      );
      await authenticatedPage.click('button:has-text("Add note")');
      await createNoteResponse;

      const newItemInput = authenticatedPage.getByTestId("new-item").locator("textarea");
      await expect(newItemInput).toBeVisible({ timeout: 5000 });

      // Type content to make additional input appear
      const testContent = testContext.prefix("First item");
      await newItemInput.fill(testContent);
      
      const additionalNewItem = authenticatedPage.getByTestId("new-item-additional");
      await expect(additionalNewItem).toBeVisible({ timeout: 2000 });

      // Tab from first input to additional input
      await newItemInput.press("Tab");
      const additionalInput = additionalNewItem.locator("textarea");
      await expect(additionalInput).toBeFocused({ timeout: 2000 });
    });

    test("should work on normal boards (not just homepage)", async ({
      authenticatedPage,
      testContext,
      testPrisma,
    }) => {
      const boardName = testContext.getBoardName("Normal Board Test");
      const board = await testPrisma.board.create({
        data: {
          name: boardName,
          description: testContext.prefix("Normal board for testing"),
          createdBy: testContext.userId,
          organizationId: testContext.organizationId,
        },
      });

      // Navigate directly to the specific board (not homepage/all-notes)
      await authenticatedPage.goto(`/boards/${board.id}`);

      // Create a new note
      const createNoteResponse = authenticatedPage.waitForResponse(
        (resp) =>
          resp.url().includes(`/api/boards/${board.id}/notes`) &&
          resp.request().method() === "POST" &&
          resp.status() === 201
      );
      await authenticatedPage.click('button:has-text("Add note")');
      await createNoteResponse;

      // Verify auto-focus works
      const newItemInput = authenticatedPage.getByTestId("new-item").locator("textarea");
      await expect(newItemInput).toBeVisible();
      await expect(newItemInput).toBeFocused({ timeout: 2000 });

      // Verify auto-add works
      const testContent = testContext.prefix("Normal board item");
      await newItemInput.fill(testContent);
      
      const additionalNewItem = authenticatedPage.getByTestId("new-item-additional");
      await expect(additionalNewItem).toBeVisible({ timeout: 2000 });
    });
  });

  
});
