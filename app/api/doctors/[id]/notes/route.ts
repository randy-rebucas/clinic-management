import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Doctor from '@/models/Doctor';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse } from '@/app/lib/auth-helpers';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  try {
    await connectDB();
    const { id } = await params;
    const body = await request.json();
    
    const note = {
      note: body.note,
      createdBy: session.userId,
      createdAt: new Date(),
      isImportant: body.isImportant || false,
    };

    const doctor = await Doctor.findByIdAndUpdate(
      id,
      { $push: { internalNotes: note } },
      { new: true }
    );

    if (!doctor) {
      return NextResponse.json(
        { success: false, error: 'Doctor not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: doctor });
  } catch (error: any) {
    console.error('Error adding note:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to add note' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  try {
    await connectDB();
    const { id } = await params;
    const searchParams = request.nextUrl.searchParams;
    const noteIndex = searchParams.get('index');

    if (noteIndex === null) {
      return NextResponse.json(
        { success: false, error: 'Note index required' },
        { status: 400 }
      );
    }

    const doctor = await Doctor.findById(id);
    if (!doctor) {
      return NextResponse.json(
        { success: false, error: 'Doctor not found' },
        { status: 404 }
      );
    }

    if (doctor.internalNotes && doctor.internalNotes.length > parseInt(noteIndex)) {
      doctor.internalNotes.splice(parseInt(noteIndex), 1);
      await doctor.save();
    }

    return NextResponse.json({ success: true, data: doctor });
  } catch (error: any) {
    console.error('Error deleting note:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete note' },
      { status: 500 }
    );
  }
}

